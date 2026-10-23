-- PROPOSAL ONLY — NOT AN APPLIED MIGRATION
--
-- This file is a review artifact. Do not execute it as-is.
-- Before implementation, verify the live schema, constraints, PostgreSQL
-- version, privileges, migration state, and deployment/worker environment.
--
-- Assumptions from seed.sql:
--   chatbots.id                 INTEGER
--   chat_sessions.id            INTEGER
--   chat_sessions.chatbot_id    INTEGER
--   messages.id                 INTEGER
--   messages.chat_session_id   INTEGER
--
-- Existing tables chatbots, chat_sessions, and messages are reused.
-- messages.enquiry_category is intentionally preserved and not backfilled.

BEGIN;

-- Composite keys let foreign keys prove the existing indirect relationship:
-- message -> session -> chatbot.
ALTER TABLE chat_sessions
  ADD CONSTRAINT chat_sessions_id_chatbot_uq UNIQUE (id, chatbot_id);

ALTER TABLE messages
  ADD CONSTRAINT messages_id_session_uq UNIQUE (id, chat_session_id);


-- Taxonomy versions: approval is distinct from activation.
CREATE TABLE chatbot_taxonomy_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatbot_id INTEGER NOT NULL
    REFERENCES chatbots(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  state TEXT NOT NULL CHECK (
    state IN ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  activated_at TIMESTAMPTZ,
  UNIQUE (chatbot_id, id),
  UNIQUE (chatbot_id, version_number),
  CHECK (
    (state = 'draft' AND approved_at IS NULL AND activated_at IS NULL)
    OR
    (state = 'approved' AND approved_at IS NOT NULL AND activated_at IS NULL)
    OR
    (state IN ('active', 'superseded', 'archived')
      AND approved_at IS NOT NULL AND activated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX chatbot_taxonomy_one_active_uq
  ON chatbot_taxonomy_versions(chatbot_id)
  WHERE state = 'active';

CREATE INDEX chatbot_taxonomy_versions_history_idx
  ON chatbot_taxonomy_versions(chatbot_id, version_number DESC);


-- Stable category identity. Names and definitions live on version membership.
CREATE TABLE chatbot_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatbot_id INTEGER NOT NULL
    REFERENCES chatbots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chatbot_id, id)
);

CREATE TABLE taxonomy_version_categories (
  chatbot_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  definition TEXT NOT NULL CHECK (length(trim(definition)) > 0),
  inclusion_guidance TEXT,
  exclusion_guidance TEXT,
  PRIMARY KEY (chatbot_id, taxonomy_version_id, category_id),
  FOREIGN KEY (chatbot_id, taxonomy_version_id)
    REFERENCES chatbot_taxonomy_versions(chatbot_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (chatbot_id, category_id)
    REFERENCES chatbot_categories(chatbot_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX taxonomy_version_categories_lookup_idx
  ON taxonomy_version_categories(chatbot_id, taxonomy_version_id, name);


-- A run is a durable logical operation and future queue/lease record.
CREATE TABLE classification_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatbot_id INTEGER NOT NULL,
  chat_session_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT,
  operation_id UUID NOT NULL,
  operation_kind TEXT NOT NULL CHECK (
    operation_kind IN (
      'incoming', 'backfill', 'reclassification', 'manual_override'
    )
  ),
  classifier_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  idempotency_key CHAR(64) NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  execution_status TEXT NOT NULL CHECK (
    execution_status IN (
      'queued', 'running', 'succeeded', 'retryable_failed',
      'dead_letter', 'pending_taxonomy', 'cancelled'
    )
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (id, chatbot_id, message_id, taxonomy_version_id),
  FOREIGN KEY (message_id, chat_session_id)
    REFERENCES messages(id, chat_session_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chat_session_id, chatbot_id)
    REFERENCES chat_sessions(id, chatbot_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chatbot_id, taxonomy_version_id)
    REFERENCES chatbot_taxonomy_versions(chatbot_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (execution_status = 'pending_taxonomy' AND taxonomy_version_id IS NULL)
    OR
    (execution_status <> 'pending_taxonomy' AND taxonomy_version_id IS NOT NULL)
  ),
  CHECK (
    (execution_status IN ('succeeded', 'dead_letter', 'cancelled')
      AND completed_at IS NOT NULL)
    OR
    (execution_status NOT IN ('succeeded', 'dead_letter', 'cancelled'))
  )
);

CREATE UNIQUE INDEX classification_runs_versioned_operation_uq
  ON classification_runs(
    chatbot_id, message_id, taxonomy_version_id, operation_id
  )
  WHERE taxonomy_version_id IS NOT NULL;

CREATE UNIQUE INDEX classification_runs_pending_operation_uq
  ON classification_runs(chatbot_id, message_id, operation_id)
  WHERE taxonomy_version_id IS NULL;

CREATE INDEX classification_runs_claim_idx
  ON classification_runs(execution_status, next_attempt_at, lease_expires_at, id);

CREATE INDEX classification_runs_message_version_idx
  ON classification_runs(chatbot_id, message_id, taxonomy_version_id);


-- One append-only row per real execution attempt.
CREATE TABLE classification_run_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL
    REFERENCES classification_runs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'succeeded', 'failed', 'abandoned')
  ),
  model_version TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_summary TEXT,
  UNIQUE (run_id, attempt_number),
  CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR
    (status <> 'running' AND completed_at IS NOT NULL
      AND completed_at >= started_at)
  )
);

CREATE INDEX classification_run_attempts_run_idx
  ON classification_run_attempts(run_id, attempt_number);


-- Immutable output. Execution status is on classification_runs; outcome is
-- separately recorded here.
CREATE TABLE classification_decisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL UNIQUE,
  chatbot_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('classified', 'uncertain', 'unclassified', 'excluded')
  ),
  source TEXT NOT NULL CHECK (
    source IN ('ai', 'manual', 'legacy_import')
  ),
  confidence NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  legacy_label TEXT,
  UNIQUE (id, chatbot_id, message_id, taxonomy_version_id),
  FOREIGN KEY (run_id, chatbot_id, message_id, taxonomy_version_id)
    REFERENCES classification_runs(id, chatbot_id, message_id, taxonomy_version_id)
    ON DELETE CASCADE,
  CHECK (
    (source = 'legacy_import' AND legacy_label IS NOT NULL)
    OR
    (source <> 'legacy_import' AND legacy_label IS NULL)
  )
);

CREATE INDEX classification_decisions_message_version_idx
  ON classification_decisions(chatbot_id, message_id, taxonomy_version_id, id);

CREATE TABLE classification_labels (
  decision_id BIGINT NOT NULL,
  chatbot_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  PRIMARY KEY (decision_id, category_id),
  FOREIGN KEY (decision_id, chatbot_id, message_id, taxonomy_version_id)
    REFERENCES classification_decisions(id, chatbot_id, message_id, taxonomy_version_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chatbot_id, taxonomy_version_id, category_id)
    REFERENCES taxonomy_version_categories(chatbot_id, taxonomy_version_id, category_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX classification_labels_category_idx
  ON classification_labels(chatbot_id, taxonomy_version_id, category_id, message_id);


-- One current review state per decision. Every transition is audited.
CREATE TABLE classification_decision_review_state (
  decision_id BIGINT PRIMARY KEY,
  chatbot_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'accepted', 'rejected', 'flagged')
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  UNIQUE (decision_id, chatbot_id, message_id, taxonomy_version_id, state),
  FOREIGN KEY (decision_id, chatbot_id, message_id, taxonomy_version_id)
    REFERENCES classification_decisions(id, chatbot_id, message_id, taxonomy_version_id)
    ON DELETE CASCADE
);

CREATE INDEX classification_review_queue_idx
  ON classification_decision_review_state(chatbot_id, state, updated_at);

CREATE TABLE classification_decision_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decision_id BIGINT NOT NULL,
  chatbot_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'accepted', 'rejected', 'flagged', 'unflagged',
      'selected', 'deselected'
    )
  ),
  selection_generation BIGINT,
  actor_id TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (decision_id, chatbot_id, message_id, taxonomy_version_id)
    REFERENCES classification_decisions(id, chatbot_id, message_id, taxonomy_version_id)
    ON DELETE CASCADE,
  CHECK (
    (event_type IN ('selected', 'deselected')
      AND selection_generation IS NOT NULL
      AND selection_generation > 0)
    OR
    (event_type NOT IN ('selected', 'deselected')
      AND selection_generation IS NULL)
  )
);

CREATE INDEX classification_decision_events_history_idx
  ON classification_decision_events(chatbot_id, message_id, taxonomy_version_id, id);

CREATE TABLE classification_current_decisions (
  chatbot_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  taxonomy_version_id BIGINT NOT NULL,
  decision_id BIGINT NOT NULL,
  required_review_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (required_review_state = 'accepted'),
  selection_generation BIGINT NOT NULL CHECK (selection_generation > 0),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chatbot_id, message_id, taxonomy_version_id),
  FOREIGN KEY (chatbot_id, taxonomy_version_id)
    REFERENCES chatbot_taxonomy_versions(chatbot_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (
    decision_id, chatbot_id, message_id, taxonomy_version_id, required_review_state
  )
    REFERENCES classification_decision_review_state(
      decision_id, chatbot_id, message_id, taxonomy_version_id, state
    )
    ON DELETE CASCADE
);

CREATE INDEX classification_current_version_idx
  ON classification_current_decisions(chatbot_id, taxonomy_version_id, message_id);


-- Proposals describe additions, rename/definition changes, merges, splits,
-- and retirements. Proposal contents freeze once reviewed.
CREATE TABLE taxonomy_proposals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chatbot_id INTEGER NOT NULL
    REFERENCES chatbots(id) ON DELETE CASCADE,
  base_version_id BIGINT,
  proposal_type TEXT NOT NULL CHECK (
    proposal_type IN (
      'addition', 'rename', 'definition_change',
      'merge', 'split', 'retirement'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'applied', 'withdrawn')
  ),
  rationale TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (chatbot_id, id),
  UNIQUE (id, chatbot_id, base_version_id),
  FOREIGN KEY (chatbot_id, base_version_id)
    REFERENCES chatbot_taxonomy_versions(chatbot_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (status = 'pending' AND reviewed_at IS NULL)
    OR
    (status <> 'pending' AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX taxonomy_proposals_review_idx
  ON taxonomy_proposals(chatbot_id, status, created_at);

CREATE TABLE taxonomy_proposal_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id BIGINT NOT NULL,
  chatbot_id INTEGER NOT NULL,
  result_category_id BIGINT,
  proposed_name TEXT,
  proposed_definition TEXT,
  inclusion_guidance TEXT,
  exclusion_guidance TEXT,
  UNIQUE (id, proposal_id, chatbot_id),
  UNIQUE (proposal_id, result_category_id),
  FOREIGN KEY (proposal_id, chatbot_id)
    REFERENCES taxonomy_proposals(id, chatbot_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chatbot_id, result_category_id)
    REFERENCES chatbot_categories(chatbot_id, id)
    ON DELETE RESTRICT,
  CHECK (proposed_name IS NULL OR length(trim(proposed_name)) > 0),
  CHECK (
    proposed_definition IS NULL
    OR length(trim(proposed_definition)) > 0
  )
);

CREATE INDEX taxonomy_proposal_items_proposal_idx
  ON taxonomy_proposal_items(chatbot_id, proposal_id, id);

CREATE TABLE taxonomy_proposal_sources (
  proposal_item_id BIGINT NOT NULL,
  proposal_id BIGINT NOT NULL,
  chatbot_id INTEGER NOT NULL,
  base_version_id BIGINT NOT NULL,
  source_category_id BIGINT NOT NULL,
  PRIMARY KEY (proposal_item_id, source_category_id),
  FOREIGN KEY (proposal_item_id, proposal_id, chatbot_id)
    REFERENCES taxonomy_proposal_items(id, proposal_id, chatbot_id)
    ON DELETE CASCADE,
  FOREIGN KEY (proposal_id, chatbot_id, base_version_id)
    REFERENCES taxonomy_proposals(id, chatbot_id, base_version_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chatbot_id, base_version_id, source_category_id)
    REFERENCES taxonomy_version_categories(chatbot_id, taxonomy_version_id, category_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX taxonomy_proposal_sources_source_idx
  ON taxonomy_proposal_sources(chatbot_id, base_version_id, source_category_id);

CREATE TABLE taxonomy_proposal_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id BIGINT NOT NULL,
  chatbot_id INTEGER NOT NULL,
  proposal_item_id BIGINT,
  evidence_kind TEXT NOT NULL CHECK (
    evidence_kind IN ('message_example', 'category_count', 'characteristic')
  ),
  source_message_id_snapshot INTEGER,
  source_created_at TIMESTAMPTZ,
  content_digest CHAR(64) CHECK (
    content_digest IS NULL OR content_digest ~ '^[a-f0-9]{64}$'
  ),
  occurrence_count INTEGER CHECK (
    occurrence_count IS NULL OR occurrence_count >= 0
  ),
  anonymized_example TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, chatbot_id),
  FOREIGN KEY (proposal_id, chatbot_id)
    REFERENCES taxonomy_proposals(id, chatbot_id)
    ON DELETE CASCADE,
  FOREIGN KEY (proposal_item_id, proposal_id, chatbot_id)
    REFERENCES taxonomy_proposal_items(id, proposal_id, chatbot_id)
    ON DELETE CASCADE,
  CHECK (
    evidence_kind <> 'message_example'
    OR source_message_id_snapshot IS NOT NULL
  )
);

CREATE INDEX taxonomy_proposal_evidence_proposal_idx
  ON taxonomy_proposal_evidence(chatbot_id, proposal_id, proposal_item_id);

-- This is a live citation. Deleting a message removes the citation but keeps
-- the minimized evidence snapshot in taxonomy_proposal_evidence.
CREATE TABLE taxonomy_proposal_message_refs (
  evidence_id BIGINT PRIMARY KEY,
  chatbot_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  chat_session_id INTEGER NOT NULL,
  FOREIGN KEY (evidence_id, chatbot_id)
    REFERENCES taxonomy_proposal_evidence(id, chatbot_id)
    ON DELETE CASCADE,
  FOREIGN KEY (message_id, chat_session_id)
    REFERENCES messages(id, chat_session_id)
    ON DELETE CASCADE,
  FOREIGN KEY (chat_session_id, chatbot_id)
    REFERENCES chat_sessions(id, chatbot_id)
    ON DELETE CASCADE
);


-- The transaction-local modes below are guardrails, not authentication.
-- Production use requires restricted table grants and trusted server calls.
CREATE FUNCTION assistly_require_write_mode(p_mode TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('assistly.write_mode', true) IS DISTINCT FROM p_mode THEN
    RAISE EXCEPTION 'Protected write requires mode %', p_mode
      USING ERRCODE = '42501';
  END IF;
END;
$$;


-- Taxonomy lifecycle. New rows must be drafts; state transitions are explicit.
CREATE FUNCTION assistly_guard_taxonomy_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_mode TEXT := current_setting('assistly.write_mode', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft'
       OR NEW.approved_at IS NOT NULL
       OR NEW.approved_by IS NOT NULL
       OR NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Taxonomy versions must be created as drafts';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.chatbot_id, NEW.version_number, NEW.created_at)
      IS DISTINCT FROM
     (OLD.id, OLD.chatbot_id, OLD.version_number, OLD.created_at) THEN
    RAISE EXCEPTION 'Taxonomy version identity is immutable';
  END IF;

  IF NEW.state = OLD.state THEN
    IF (NEW.approved_at, NEW.approved_by, NEW.activated_at)
       IS DISTINCT FROM
       (OLD.approved_at, OLD.approved_by, OLD.activated_at) THEN
      RAISE EXCEPTION 'Taxonomy audit fields cannot be edited directly';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'draft' AND NEW.state = 'approved'
      AND v_mode = 'taxonomy_approve'
      AND NEW.approved_at IS NOT NULL AND NEW.approved_by IS NOT NULL)
    OR
    (OLD.state = 'approved' AND NEW.state = 'active'
      AND v_mode = 'taxonomy_activate'
      AND NEW.activated_at IS NOT NULL)
    OR
    (OLD.state = 'active' AND NEW.state = 'superseded'
      AND v_mode = 'taxonomy_activate')
    OR
    (OLD.state IN ('approved', 'superseded') AND NEW.state = 'archived'
      AND v_mode = 'taxonomy_archive')
  ) THEN
    RAISE EXCEPTION 'Invalid taxonomy transition: % -> %', OLD.state, NEW.state;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER chatbot_taxonomy_version_guard_trg
BEFORE INSERT OR UPDATE ON chatbot_taxonomy_versions
FOR EACH ROW EXECUTE FUNCTION assistly_guard_taxonomy_version();

CREATE FUNCTION assistly_guard_version_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_id BIGINT;
  v_state TEXT;
BEGIN
  v_version_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.taxonomy_version_id ELSE NEW.taxonomy_version_id END;

  SELECT state INTO v_state
  FROM chatbot_taxonomy_versions
  WHERE id = v_version_id
  FOR UPDATE;

  IF v_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft taxonomy membership may be edited';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.chatbot_id, NEW.taxonomy_version_id, NEW.category_id)
         IS DISTINCT FROM
         (OLD.chatbot_id, OLD.taxonomy_version_id, OLD.category_id) THEN
    RAISE EXCEPTION 'Version category identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER taxonomy_version_category_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON taxonomy_version_categories
FOR EACH ROW EXECUTE FUNCTION assistly_guard_version_category();


-- Run state machine. New runs are queued or pending taxonomy.
CREATE FUNCTION assistly_guard_classification_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.execution_status NOT IN ('queued', 'pending_taxonomy')
       OR NEW.attempt_count <> 0
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid initial classification run state';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.chatbot_id, NEW.chat_session_id, NEW.message_id,
      NEW.taxonomy_version_id, NEW.operation_id, NEW.operation_kind,
      NEW.classifier_version, NEW.prompt_version, NEW.idempotency_key,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.chatbot_id, OLD.chat_session_id, OLD.message_id,
      OLD.taxonomy_version_id, OLD.operation_id, OLD.operation_kind,
      OLD.classifier_version, OLD.prompt_version, OLD.idempotency_key,
      OLD.created_at) THEN
    RAISE EXCEPTION 'Classification run identity is immutable';
  END IF;

  IF NEW.execution_status = OLD.execution_status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.execution_status = 'queued'
      AND NEW.execution_status IN ('running', 'cancelled'))
    OR
    (OLD.execution_status = 'running'
      AND NEW.execution_status IN ('succeeded', 'retryable_failed', 'dead_letter'))
    OR
    (OLD.execution_status = 'retryable_failed'
      AND NEW.execution_status IN ('queued', 'running', 'dead_letter'))
    OR
    (OLD.execution_status = 'pending_taxonomy'
      AND NEW.execution_status IN ('queued', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid run transition: % -> %',
      OLD.execution_status, NEW.execution_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER classification_run_guard_trg
BEFORE INSERT OR UPDATE ON classification_runs
FOR EACH ROW EXECUTE FUNCTION assistly_guard_classification_run();


CREATE FUNCTION assistly_guard_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'running' OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Attempts must be created in running state';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attempt history is append-only';
  END IF;

  IF (NEW.id, NEW.run_id, NEW.attempt_number, NEW.started_at)
     IS DISTINCT FROM
     (OLD.id, OLD.run_id, OLD.attempt_number, OLD.started_at) THEN
    RAISE EXCEPTION 'Attempt identity is immutable';
  END IF;

  IF OLD.status <> 'running'
     OR NEW.status NOT IN ('succeeded', 'failed', 'abandoned') THEN
    RAISE EXCEPTION 'Invalid attempt transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER classification_attempt_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON classification_run_attempts
FOR EACH ROW EXECUTE FUNCTION assistly_guard_attempt();


-- Decisions and labels cannot be edited in place.
CREATE FUNCTION assistly_reject_immutable_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER classification_decision_immutable_trg
BEFORE UPDATE OR DELETE ON classification_decisions
FOR EACH ROW EXECUTE FUNCTION assistly_reject_immutable_update();

CREATE TRIGGER classification_label_immutable_trg
BEFORE UPDATE OR DELETE ON classification_labels
FOR EACH ROW EXECUTE FUNCTION assistly_reject_immutable_update();


-- Review-state transitions are changed only by transactional review routines.
CREATE FUNCTION assistly_guard_review_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_mode TEXT := current_setting('assistly.write_mode', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending'
       OR v_mode NOT IN ('classification_complete', 'manual_override') THEN
      RAISE EXCEPTION 'Review state must start pending through completion';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Review state cannot be deleted directly';
  END IF;

  IF (NEW.decision_id, NEW.chatbot_id, NEW.message_id,
      NEW.taxonomy_version_id)
     IS DISTINCT FROM
     (OLD.decision_id, OLD.chatbot_id, OLD.message_id,
      OLD.taxonomy_version_id) THEN
    RAISE EXCEPTION 'Review identity is immutable';
  END IF;

  IF v_mode NOT IN ('review_accept', 'review_reject', 'review_flag') THEN
    RAISE EXCEPTION 'Review changes require a review operation';
  END IF;

  IF NOT (
    (OLD.state = 'pending'
      AND NEW.state IN ('accepted', 'rejected', 'flagged'))
    OR
    (OLD.state = 'flagged'
      AND NEW.state IN ('accepted', 'rejected'))
    OR
    (OLD.state = 'accepted' AND NEW.state = 'rejected')
  ) THEN
    RAISE EXCEPTION 'Invalid review transition: % -> %', OLD.state, NEW.state;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER classification_review_state_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON classification_decision_review_state
FOR EACH ROW EXECUTE FUNCTION assistly_guard_review_state();

CREATE FUNCTION assistly_audit_review_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.state = OLD.state THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_event := CASE NEW.state
    WHEN 'accepted' THEN 'accepted'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'flagged' THEN 'flagged'
    WHEN 'pending' THEN 'unflagged'
  END;

  INSERT INTO classification_decision_events(
    decision_id, chatbot_id, message_id, taxonomy_version_id,
    event_type, actor_id, reason
  )
  VALUES (
    NEW.decision_id, NEW.chatbot_id, NEW.message_id, NEW.taxonomy_version_id,
    v_event,
    current_setting('assistly.actor_id', true),
    current_setting('assistly.reason', true)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER classification_review_audit_trg
AFTER UPDATE ON classification_decision_review_state
FOR EACH ROW EXECUTE FUNCTION assistly_audit_review_state();


-- Current pointer is keyed by chatbot/message/version. Its FK to the review
-- state includes the required literal accepted state.
CREATE FUNCTION assistly_guard_current_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_mode TEXT := current_setting('assistly.write_mode', true);
BEGIN
  IF v_mode <> 'canonical_replace' THEN
    RAISE EXCEPTION 'Canonical pointer changes require canonical operation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.selection_generation <> 1 THEN
      RAISE EXCEPTION 'Initial selection generation must be 1';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.chatbot_id, NEW.message_id, NEW.taxonomy_version_id)
       IS DISTINCT FROM
       (OLD.chatbot_id, OLD.message_id, OLD.taxonomy_version_id) THEN
      RAISE EXCEPTION 'Canonical pointer key is immutable';
    END IF;
    IF NEW.decision_id = OLD.decision_id
       OR NEW.selection_generation <> OLD.selection_generation + 1 THEN
      RAISE EXCEPTION 'Invalid canonical pointer replacement';
    END IF;
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER classification_current_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON classification_current_decisions
FOR EACH ROW EXECUTE FUNCTION assistly_guard_current_decision();

CREATE FUNCTION assistly_audit_current_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO classification_decision_events(
      decision_id, chatbot_id, message_id, taxonomy_version_id,
      event_type, selection_generation, actor_id, reason
    )
    VALUES (
      NEW.decision_id, NEW.chatbot_id, NEW.message_id, NEW.taxonomy_version_id,
      'selected', NEW.selection_generation,
      current_setting('assistly.actor_id', true),
      current_setting('assistly.reason', true)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO classification_decision_events(
      decision_id, chatbot_id, message_id, taxonomy_version_id,
      event_type, selection_generation, actor_id, reason
    )
    VALUES (
      OLD.decision_id, OLD.chatbot_id, OLD.message_id, OLD.taxonomy_version_id,
      'deselected', NEW.selection_generation,
      current_setting('assistly.actor_id', true),
      current_setting('assistly.reason', true)
    );
    INSERT INTO classification_decision_events(
      decision_id, chatbot_id, message_id, taxonomy_version_id,
      event_type, selection_generation, actor_id, reason
    )
    VALUES (
      NEW.decision_id, NEW.chatbot_id, NEW.message_id, NEW.taxonomy_version_id,
      'selected', NEW.selection_generation,
      current_setting('assistly.actor_id', true),
      current_setting('assistly.reason', true)
    );
    RETURN NEW;
  ELSE
    INSERT INTO classification_decision_events(
      decision_id, chatbot_id, message_id, taxonomy_version_id,
      event_type, selection_generation, actor_id, reason
    )
    VALUES (
      OLD.decision_id, OLD.chatbot_id, OLD.message_id, OLD.taxonomy_version_id,
      'deselected', OLD.selection_generation + 1,
      current_setting('assistly.actor_id', true),
      current_setting('assistly.reason', true)
    );
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER classification_current_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON classification_current_decisions
FOR EACH ROW EXECUTE FUNCTION assistly_audit_current_decision();

CREATE FUNCTION assistly_guard_event_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Decision events are append-only';
END;
$$;

CREATE TRIGGER classification_event_append_only_trg
BEFORE UPDATE OR DELETE ON classification_decision_events
FOR EACH ROW EXECUTE FUNCTION assistly_guard_event_append_only();


-- Proposal state transitions.
CREATE FUNCTION assistly_guard_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_mode TEXT := current_setting('assistly.write_mode', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Proposals must be created pending';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.chatbot_id, NEW.base_version_id, NEW.proposal_type,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.chatbot_id, OLD.base_version_id, OLD.proposal_type,
      OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Proposal identity is immutable';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending'
      AND NEW.status IN ('approved', 'rejected', 'withdrawn')
      AND v_mode = 'proposal_review'
      AND NEW.reviewed_at IS NOT NULL
      AND NEW.reviewed_by IS NOT NULL)
    OR
    (OLD.status = 'approved' AND NEW.status = 'applied'
      AND v_mode = 'proposal_apply')
  ) THEN
    RAISE EXCEPTION 'Invalid proposal transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER taxonomy_proposal_guard_trg
BEFORE INSERT OR UPDATE ON taxonomy_proposals
FOR EACH ROW EXECUTE FUNCTION assistly_guard_proposal();

CREATE FUNCTION assistly_guard_proposal_child()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_proposal_id BIGINT;
  v_status TEXT;
BEGIN
  v_proposal_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.proposal_id ELSE NEW.proposal_id END;

  SELECT status INTO v_status
  FROM taxonomy_proposals
  WHERE id = v_proposal_id
  FOR UPDATE;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Reviewed proposal contents are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER taxonomy_proposal_items_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON taxonomy_proposal_items
FOR EACH ROW EXECUTE FUNCTION assistly_guard_proposal_child();

CREATE TRIGGER taxonomy_proposal_sources_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON taxonomy_proposal_sources
FOR EACH ROW EXECUTE FUNCTION assistly_guard_proposal_child();

CREATE TRIGGER taxonomy_proposal_evidence_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON taxonomy_proposal_evidence
FOR EACH ROW EXECUTE FUNCTION assistly_guard_proposal_child();


-- Proposal cardinality checks run at transaction end on approval/application.
CREATE FUNCTION assistly_check_proposal_cardinality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_type TEXT;
  v_status TEXT;
  v_items BIGINT;
  v_sources BIGINT;
  v_distinct_sources BIGINT;
  v_null_results BIGINT;
  v_split_source_result_count BIGINT;
BEGIN
  SELECT proposal_type, status INTO v_type, v_status
  FROM taxonomy_proposals WHERE id = NEW.id;

  IF v_status NOT IN ('approved', 'applied') THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE result_category_id IS NULL)
    INTO v_items, v_null_results
  FROM taxonomy_proposal_items WHERE proposal_id = NEW.id;

  SELECT COUNT(*), COUNT(DISTINCT source_category_id)
    INTO v_sources, v_distinct_sources
  FROM taxonomy_proposal_sources WHERE proposal_id = NEW.id;

  IF v_type = 'addition' THEN
    IF v_items <> 1 OR v_sources <> 0
       OR (v_status = 'approved' AND v_null_results <> 1)
       OR (v_status = 'applied' AND v_null_results <> 0) THEN
      RAISE EXCEPTION 'Invalid addition proposal cardinality';
    END IF;
  ELSIF v_type IN ('rename', 'definition_change', 'retirement') THEN
    IF v_items <> 1 OR v_sources <> 1
       OR v_distinct_sources <> 1 OR v_null_results <> 0 THEN
      RAISE EXCEPTION 'Invalid single-category proposal cardinality';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM taxonomy_proposal_items i
      JOIN taxonomy_proposal_sources s ON s.proposal_item_id = i.id
      WHERE i.proposal_id = NEW.id
        AND i.result_category_id <> s.source_category_id
    ) THEN
      RAISE EXCEPTION 'Single-category proposal must retain category identity';
    END IF;
  ELSIF v_type = 'merge' THEN
    IF v_items <> 1 OR v_sources < 2
       OR v_sources <> v_distinct_sources
       OR (v_status = 'applied' AND v_null_results <> 0) THEN
      RAISE EXCEPTION 'Invalid merge proposal cardinality';
    END IF;
  ELSIF v_type = 'split' THEN
    IF v_items < 2 OR v_sources <> 1 OR v_distinct_sources <> 1
       OR (v_status = 'applied' AND v_null_results <> 0) THEN
      RAISE EXCEPTION 'Invalid split proposal cardinality';
    END IF;

    SELECT COUNT(*) INTO v_split_source_result_count
    FROM taxonomy_proposal_items i
    JOIN taxonomy_proposal_sources s ON s.proposal_id = i.proposal_id
    WHERE i.proposal_id = NEW.id
      AND i.result_category_id = s.source_category_id;

    IF v_split_source_result_count > 1 THEN
      RAISE EXCEPTION 'Split may preserve source identity at most once';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER taxonomy_proposal_cardinality_trg
AFTER UPDATE ON taxonomy_proposals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.status IN ('approved', 'applied'))
EXECUTE FUNCTION assistly_check_proposal_cardinality();


-- A classified outcome requires labels; all other outcomes require none.
CREATE FUNCTION assistly_check_decision_labels()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_decision_id BIGINT;
  v_outcome TEXT;
  v_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'classification_decisions' THEN
    v_decision_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_decision_id := COALESCE(NEW.decision_id, OLD.decision_id);
  END IF;

  SELECT outcome INTO v_outcome
  FROM classification_decisions WHERE id = v_decision_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_count
  FROM classification_labels WHERE decision_id = v_decision_id;

  IF (v_outcome = 'classified' AND v_count = 0)
     OR (v_outcome <> 'classified' AND v_count <> 0) THEN
    RAISE EXCEPTION 'Labels do not match decision outcome';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER classification_decision_labels_check_trg
AFTER INSERT ON classification_decisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assistly_check_decision_labels();

CREATE CONSTRAINT TRIGGER classification_label_decision_check_trg
AFTER INSERT OR DELETE ON classification_labels
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assistly_check_decision_labels();


-- Atomically supersede any active version and activate an approved version.
CREATE FUNCTION assistly_activate_taxonomy(
  p_chatbot_id INTEGER,
  p_version_id BIGINT,
  p_actor_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_state TEXT;
BEGIN
  PERFORM 1 FROM chatbots WHERE id = p_chatbot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chatbot not found'; END IF;

  SELECT state INTO v_target_state
  FROM chatbot_taxonomy_versions
  WHERE id = p_version_id AND chatbot_id = p_chatbot_id
  FOR UPDATE;

  IF v_target_state IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Only an approved taxonomy can be activated';
  END IF;

  PERFORM set_config('assistly.write_mode', 'taxonomy_activate', true);
  PERFORM set_config('assistly.actor_id', p_actor_id, true);

  UPDATE chatbot_taxonomy_versions
  SET state = 'superseded'
  WHERE chatbot_id = p_chatbot_id AND state = 'active';

  UPDATE chatbot_taxonomy_versions
  SET state = 'active', activated_at = now()
  WHERE id = p_version_id AND chatbot_id = p_chatbot_id;
END;
$$;


-- Completion is all-or-nothing: decision, labels, pending review state,
-- successful attempt, and succeeded run commit in one transaction.
CREATE FUNCTION assistly_complete_classification(
  p_run_id BIGINT,
  p_outcome TEXT,
  p_category_ids BIGINT[],
  p_confidence NUMERIC,
  p_model_version TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_run classification_runs%ROWTYPE;
  v_attempt_id BIGINT;
  v_decision_id BIGINT;
  v_category_id BIGINT;
BEGIN
  SELECT * INTO v_run
  FROM classification_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND OR v_run.execution_status <> 'running' THEN
    RAISE EXCEPTION 'Run is not running';
  END IF;

  IF p_outcome NOT IN ('classified', 'uncertain', 'unclassified', 'excluded') THEN
    RAISE EXCEPTION 'Invalid decision outcome';
  END IF;

  IF p_outcome = 'classified'
     AND COALESCE(cardinality(p_category_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Classified decision requires at least one category';
  END IF;
  IF p_outcome <> 'classified'
     AND COALESCE(cardinality(p_category_ids), 0) <> 0 THEN
    RAISE EXCEPTION 'Only classified outcomes may have labels';
  END IF;

  PERFORM set_config('assistly.write_mode', 'classification_complete', true);

  INSERT INTO classification_decisions(
    run_id, chatbot_id, message_id, taxonomy_version_id,
    outcome, source, confidence
  )
  VALUES (
    v_run.id, v_run.chatbot_id, v_run.message_id, v_run.taxonomy_version_id,
    p_outcome, 'ai', p_confidence
  )
  RETURNING id INTO v_decision_id;

  INSERT INTO classification_decision_review_state(
    decision_id, chatbot_id, message_id, taxonomy_version_id, state
  )
  VALUES (
    v_decision_id, v_run.chatbot_id, v_run.message_id,
    v_run.taxonomy_version_id, 'pending'
  );

  FOREACH v_category_id IN ARRAY COALESCE(p_category_ids, ARRAY[]::BIGINT[])
  LOOP
    INSERT INTO classification_labels(
      decision_id, chatbot_id, message_id, taxonomy_version_id, category_id
    )
    VALUES (
      v_decision_id, v_run.chatbot_id, v_run.message_id,
      v_run.taxonomy_version_id, v_category_id
    );
  END LOOP;

  SELECT id INTO v_attempt_id
  FROM classification_run_attempts
  WHERE run_id = p_run_id AND status = 'running'
  ORDER BY attempt_number DESC
  LIMIT 1
  FOR UPDATE;

  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'No running attempt exists for run';
  END IF;

  UPDATE classification_run_attempts
  SET status = 'succeeded',
      model_version = p_model_version,
      completed_at = now()
  WHERE id = v_attempt_id;

  UPDATE classification_runs
  SET execution_status = 'succeeded',
      completed_at = now(),
      lease_expires_at = NULL,
      next_attempt_at = NULL
  WHERE id = p_run_id;

  RETURN v_decision_id;
END;
$$;


-- Replace selection with an accepted decision using a locked message row and
-- compare-and-set expected current ID. NULL means no current pointer expected.
CREATE FUNCTION assistly_replace_canonical_decision(
  p_decision_id BIGINT,
  p_expected_current_decision_id BIGINT,
  p_actor_id TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_decision classification_decisions%ROWTYPE;
  v_current_id BIGINT;
BEGIN
  SELECT * INTO v_decision
  FROM classification_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Decision not found'; END IF;

  PERFORM 1 FROM messages WHERE id = v_decision.message_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;

  SELECT decision_id INTO v_current_id
  FROM classification_current_decisions
  WHERE chatbot_id = v_decision.chatbot_id
    AND message_id = v_decision.message_id
    AND taxonomy_version_id = v_decision.taxonomy_version_id
  FOR UPDATE;

  IF v_current_id IS DISTINCT FROM p_expected_current_decision_id THEN
    RAISE EXCEPTION 'Canonical decision changed; retry with current value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM classification_decision_review_state
    WHERE decision_id = p_decision_id
      AND chatbot_id = v_decision.chatbot_id
      AND message_id = v_decision.message_id
      AND taxonomy_version_id = v_decision.taxonomy_version_id
      AND state = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Only accepted decisions can be selected';
  END IF;

  PERFORM set_config('assistly.write_mode', 'canonical_replace', true);
  PERFORM set_config('assistly.actor_id', p_actor_id, true);
  PERFORM set_config('assistly.reason', p_reason, true);

  IF v_current_id IS NULL THEN
    INSERT INTO classification_current_decisions(
      chatbot_id, message_id, taxonomy_version_id,
      decision_id, selection_generation
    )
    VALUES (
      v_decision.chatbot_id, v_decision.message_id,
      v_decision.taxonomy_version_id, v_decision.id, 1
    );
  ELSE
    UPDATE classification_current_decisions
    SET decision_id = p_decision_id,
        selection_generation = selection_generation + 1,
        selected_at = now()
    WHERE chatbot_id = v_decision.chatbot_id
      AND message_id = v_decision.message_id
      AND taxonomy_version_id = v_decision.taxonomy_version_id;
  END IF;
END;
$$;

CREATE FUNCTION assistly_deselect_canonical_decision(
  p_chatbot_id INTEGER,
  p_message_id INTEGER,
  p_taxonomy_version_id BIGINT,
  p_expected_decision_id BIGINT,
  p_actor_id TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_id BIGINT;
BEGIN
  PERFORM 1 FROM messages WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;

  SELECT decision_id INTO v_current_id
  FROM classification_current_decisions
  WHERE chatbot_id = p_chatbot_id
    AND message_id = p_message_id
    AND taxonomy_version_id = p_taxonomy_version_id
  FOR UPDATE;

  IF v_current_id IS DISTINCT FROM p_expected_decision_id THEN
    RAISE EXCEPTION 'Canonical decision changed; retry with current value';
  END IF;

  PERFORM set_config('assistly.write_mode', 'canonical_replace', true);
  PERFORM set_config('assistly.actor_id', p_actor_id, true);
  PERFORM set_config('assistly.reason', p_reason, true);

  DELETE FROM classification_current_decisions
  WHERE chatbot_id = p_chatbot_id
    AND message_id = p_message_id
    AND taxonomy_version_id = p_taxonomy_version_id;
END;
$$;


-- Acceptance and optional selection commit with review and selection events.
CREATE FUNCTION assistly_accept_decision(
  p_decision_id BIGINT,
  p_actor_id TEXT,
  p_reason TEXT,
  p_select BOOLEAN DEFAULT FALSE,
  p_expected_current_decision_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_review classification_decision_review_state%ROWTYPE;
BEGIN
  SELECT * INTO v_review
  FROM classification_decision_review_state
  WHERE decision_id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR v_review.state NOT IN ('pending', 'flagged') THEN
    RAISE EXCEPTION 'Decision cannot be accepted from its current state';
  END IF;

  PERFORM set_config('assistly.write_mode', 'review_accept', true);
  PERFORM set_config('assistly.actor_id', p_actor_id, true);
  PERFORM set_config('assistly.reason', p_reason, true);

  UPDATE classification_decision_review_state
  SET state = 'accepted', updated_at = now(), updated_by = p_actor_id
  WHERE decision_id = p_decision_id;

  IF p_select THEN
    PERFORM assistly_replace_canonical_decision(
      p_decision_id, p_expected_current_decision_id, p_actor_id, p_reason
    );
  END IF;
END;
$$;

CREATE FUNCTION assistly_reject_decision(
  p_decision_id BIGINT,
  p_actor_id TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_review classification_decision_review_state%ROWTYPE;
  v_current BIGINT;
BEGIN
  SELECT * INTO v_review
  FROM classification_decision_review_state
  WHERE decision_id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR v_review.state NOT IN ('pending', 'flagged', 'accepted') THEN
    RAISE EXCEPTION 'Decision cannot be rejected from its current state';
  END IF;

  SELECT decision_id INTO v_current
  FROM classification_current_decisions
  WHERE chatbot_id = v_review.chatbot_id
    AND message_id = v_review.message_id
    AND taxonomy_version_id = v_review.taxonomy_version_id
  FOR UPDATE;

  PERFORM set_config('assistly.write_mode', 'canonical_replace', true);
  PERFORM set_config('assistly.actor_id', p_actor_id, true);
  PERFORM set_config('assistly.reason', p_reason, true);

  IF v_current = p_decision_id THEN
    DELETE FROM classification_current_decisions
    WHERE chatbot_id = v_review.chatbot_id
      AND message_id = v_review.message_id
      AND taxonomy_version_id = v_review.taxonomy_version_id;
  END IF;

  PERFORM set_config('assistly.write_mode', 'review_reject', true);
  UPDATE classification_decision_review_state
  SET state = 'rejected', updated_at = now(), updated_by = p_actor_id
  WHERE decision_id = p_decision_id;
END;
$$;

COMMIT;


-- PROPOSED READ-ONLY PREFLIGHT (run separately, after authorization):
--
-- SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('chatbots', 'chat_sessions', 'messages')
-- ORDER BY table_name, ordinal_position;
--
-- SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
--        kcu.column_name, ccu.table_name AS referenced_table,
--        ccu.column_name AS referenced_column
-- FROM information_schema.table_constraints tc
-- LEFT JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
--  AND tc.table_schema = kcu.table_schema
-- LEFT JOIN information_schema.constraint_column_usage ccu
--   ON tc.constraint_name = ccu.constraint_name
--  AND tc.table_schema = ccu.table_schema
-- WHERE tc.table_schema = 'public'
--   AND tc.table_name IN ('chatbots', 'chat_sessions', 'messages')
-- ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
--
-- SELECT COUNT(*) AS orphan_sessions
-- FROM chat_sessions s
-- LEFT JOIN chatbots c ON c.id = s.chatbot_id
-- WHERE c.id IS NULL;
--
-- SELECT COUNT(*) AS orphan_messages
-- FROM messages m
-- LEFT JOIN chat_sessions s ON s.id = m.chat_session_id
-- WHERE s.id IS NULL;
