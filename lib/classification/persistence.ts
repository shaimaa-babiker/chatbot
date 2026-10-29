import { createHash, randomUUID } from "node:crypto";
import sql from "@/lib/db";
import { authorizeClassificationAction } from "./serverAuthorization";
import type { ClassificationRun } from "./schemas";
import { decisionLabelSchema, decisionOutcomeSchema } from "./schemas";

export type EnqueueMessageClassificationInput = {
  chatbotId: number;
  sessionId: number;
  messageId: number;
  content: string;
  createdAt: string;
  idempotencyKey?: string | null;
};

export type EnqueueMessageClassificationResult = {
  runId: number;
  state: ClassificationRun["state"];
  taxonomyVersionId: number | null;
  created: boolean;
};

export type ClaimedClassificationRun = {
  runId: number;
  attemptId: number;
  fencingToken: string;
  leaseExpiresAt: string;
  chatbotId: number;
  sessionId: number;
  messageId: number;
  taxonomyVersionId: number;
  operationIdentity: Record<string, unknown>;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Records the logical operation and outbox row through one PostgreSQL function
 * call. The function is atomic; this method returns only after its commit.
 * Authorization for user-facing calls belongs to the trusted route. The guest
 * send route calls only after its existing session-capability check.
 */
export async function enqueueMessageClassification(
  input: EnqueueMessageClassificationInput,
): Promise<EnqueueMessageClassificationResult> {
  const kind = "incoming" as const;
  const logicalOperationKey = `${kind}:${input.messageId}`;
  const idempotencyKey = input.idempotencyKey?.trim() || logicalOperationKey;
  if (idempotencyKey.length > 200 || idempotencyKey.length === 0) {
    throw new Error("Invalid classification idempotency key");
  }

  const parsedCreatedAt = new Date(input.createdAt);
  if (!Number.isFinite(parsedCreatedAt.getTime())) throw new Error("Invalid message creation timestamp");
  const identity = {
    chatbotId: input.chatbotId,
    sessionId: input.sessionId,
    messageId: input.messageId,
    operationKind: kind,
    logicalOperationKey,
    taxonomyBinding: "first_active_version_after_enqueue",
    messageCreatedAt: parsedCreatedAt.toISOString(),
    messageContentDigest: digest(input.content),
  };
  const identityJson = JSON.stringify(identity);
  const payloadDigest = digest(identityJson);

  const rows = await sql`
    SELECT run_id, run_state, taxonomy_version_id, created
    FROM public.enqueue_classification_run(
      ${input.chatbotId},
      ${input.sessionId},
      ${input.messageId},
      ${kind},
      ${logicalOperationKey},
      ${idempotencyKey},
      ${identityJson}::jsonb,
      ${payloadDigest}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Classification enqueue did not return a durable run");
  return {
    runId: Number(row.run_id),
    state: row.run_state as ClassificationRun["state"],
    taxonomyVersionId: row.taxonomy_version_id === null ? null : Number(row.taxonomy_version_id),
    created: Boolean(row.created),
  };
}

/**
 * Reconciles persisted user messages missing an incoming logical operation.
 * It is safe to call repeatedly; the same natural operation key is used by
 * normal enqueueing. This is a callable primitive, not a deployed scheduler.
 */
export async function reconcileIncomingClassifications(batchSize = 100): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("batchSize must be between 1 and 500");
  }
  const candidates = await sql`
    SELECT c.id AS chatbot_id, s.id AS session_id, m.id AS message_id,
           m.content, m.created_at
    FROM public.messages m
    JOIN public.chat_sessions s ON s.id = m.chat_session_id
    JOIN public.chatbots c ON c.id = s.chatbot_id
    LEFT JOIN public.classification_runs r
      ON r.chatbot_id = c.id AND r.message_id = m.id AND r.operation_kind = 'incoming'
    WHERE m.sender = 'user' AND r.id IS NULL AND c.archived_at IS NULL
      AND m.id > (SELECT message_id_cutoff
                  FROM public.classification_reconciliation_control
                  WHERE singleton_id = 1)
    ORDER BY m.created_at, m.id
    LIMIT ${batchSize}
  `;
  let enqueued = 0;
  for (const row of candidates) {
    await enqueueMessageClassification({
      chatbotId: Number(row.chatbot_id),
      sessionId: Number(row.session_id),
      messageId: Number(row.message_id),
      content: String(row.content),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      idempotencyKey: `reconcile:incoming:${Number(row.message_id)}`,
    });
    enqueued += 1;
  }
  return enqueued;
}

export async function approveTaxonomyVersion(
  chatbotId: number,
  versionId: number,
): Promise<void> {
  const authorization = await authorizeClassificationAction(chatbotId, "approve_taxonomy");
  if (!authorization.allowed || !authorization.userId) throw new Error("Forbidden");
  await sql`
    SELECT public.approve_classification_taxonomy(
      ${chatbotId}, ${versionId}, ${authorization.userId}
    )
  `;
}

export async function createTaxonomyDraft(
  chatbotId: number,
  categories: Array<{
    name: string;
    definition: string;
    inclusionGuidance?: string | null;
    exclusionGuidance?: string | null;
  }>,
): Promise<number> {
  const authorization = await authorizeClassificationAction(chatbotId, "approve_taxonomy");
  if (!authorization.allowed || !authorization.userId) throw new Error("Forbidden");
  if (categories.length === 0) throw new Error("A taxonomy draft requires at least one category");
  const rows = await sql`
    SELECT public.create_classification_taxonomy_draft(
      ${chatbotId}, ${authorization.userId}, ${JSON.stringify(categories)}::jsonb
    ) AS version_id
  `;
  const versionId = Number(rows[0]?.version_id);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    throw new Error("Taxonomy draft creation did not return a version");
  }
  return versionId;
}

export async function activateTaxonomyVersion(
  chatbotId: number,
  versionId: number,
): Promise<void> {
  const authorization = await authorizeClassificationAction(chatbotId, "activate_taxonomy");
  if (!authorization.allowed || !authorization.userId) throw new Error("Forbidden");
  await sql`
    SELECT public.activate_classification_taxonomy(
      ${chatbotId}, ${versionId}, ${authorization.userId}
    )
  `;
}

/** Claim primitive for a future worker; no worker or scheduler is deployed here. */
export async function claimNextClassificationRun(leaseSeconds = 120): Promise<ClaimedClassificationRun | null> {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 3600) {
    throw new Error("leaseSeconds must be between 15 and 3600");
  }
  const token = randomUUID();
  const rows = await sql`
    SELECT * FROM public.claim_classification_run(${token}, ${leaseSeconds})
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    runId: Number(row.run_id),
    attemptId: Number(row.attempt_id),
    fencingToken: String(row.fencing_token),
    leaseExpiresAt: row.lease_expires_at instanceof Date
      ? row.lease_expires_at.toISOString()
      : String(row.lease_expires_at),
    chatbotId: Number(row.chatbot_id),
    sessionId: Number(row.chat_session_id),
    messageId: Number(row.message_id),
    taxonomyVersionId: Number(row.taxonomy_version_id),
    operationIdentity: row.operation_identity as Record<string, unknown>,
  };
}

export async function renewClassificationLease(
  runId: number,
  attemptId: number,
  fencingToken: string,
  leaseSeconds = 120,
): Promise<string> {
  const rows = await sql`
    SELECT public.renew_classification_lease(
      ${runId}, ${attemptId}, ${fencingToken}, ${leaseSeconds}
    ) AS lease_expires_at
  `;
  const expiry = rows[0]?.lease_expires_at;
  if (!expiry) throw new Error("Lease renewal did not return an expiry");
  return expiry instanceof Date ? expiry.toISOString() : String(expiry);
}

export async function failClassificationRun(
  runId: number,
  attemptId: number,
  fencingToken: string,
  errorCode: string,
  retryDelaySeconds = 30,
  retryable = true,
): Promise<"retryable_failed" | "dead_letter"> {
  const rows = await sql`
    SELECT public.fail_classification_run(
      ${runId}, ${attemptId}, ${fencingToken}, ${errorCode.slice(0, 200)}, ${retryDelaySeconds}, ${retryable}
    ) AS run_state
  `;
  const state = rows[0]?.run_state;
  if (state !== "retryable_failed" && state !== "dead_letter") {
    throw new Error("Failure transition did not return a terminal or retry state");
  }
  return state;
}

export async function completeClassificationRun(input: {
  runId: number;
  attemptId: number;
  fencingToken: string;
  outcome: string;
  confidence: number | null;
  labels: Array<{ categoryId: number; rationale: string }>;
  modelVersion: string | null;
  promptVersion: string | null;
}): Promise<number> {
  const outcome = decisionOutcomeSchema.parse(input.outcome);
  const labels = input.labels.map((label) => decisionLabelSchema.parse(label));
  if (input.confidence !== null && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) {
    throw new Error("confidence must be null or between zero and one");
  }
  if ((outcome === "classified") !== (labels.length > 0)) {
    throw new Error("Outcome and label cardinality disagree");
  }
  const rows = await sql`
    SELECT public.complete_classification_run(
      ${input.runId}, ${input.attemptId}, ${input.fencingToken},
      ${outcome}, ${input.confidence}, ${JSON.stringify(labels)}::jsonb,
      ${input.modelVersion}, ${input.promptVersion}
    ) AS decision_id
  `;
  const decisionId = Number(rows[0]?.decision_id);
  if (!Number.isInteger(decisionId) || decisionId <= 0) {
    throw new Error("Classification completion did not return a decision");
  }
  return decisionId;
}
