import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mocks.sql }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));

import { enqueueMessageClassification, reconcileIncomingClassifications } from "../../../lib/classification/persistence";
import { authorizeClassificationAction } from "../../../lib/classification/serverAuthorization";

beforeEach(() => mocks.sql.mockReset());

describe("durable classification persistence boundary", () => {
  it("resolves owner/editor/viewer authorization from trusted chatbot-scoped facts", async () => {
    mocks.auth.mockResolvedValue({ userId: "editor-user" });
    mocks.currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: "Editor@Example.com" } });
    mocks.sql.mockResolvedValueOnce([{ owner_user_id: "owner-user", invited_role: "editor" }]);
    await expect(authorizeClassificationAction(3, "request_classification"))
      .resolves.toMatchObject({ allowed: true, userId: "editor-user" });

    mocks.sql.mockReset();
    mocks.sql.mockResolvedValueOnce([{ owner_user_id: "owner-user", invited_role: "viewer" }]);
    await expect(authorizeClassificationAction(3, "review_decision"))
      .resolves.toMatchObject({ allowed: false, userId: "editor-user" });

    mocks.sql.mockReset();
    mocks.sql.mockResolvedValueOnce([{ owner_user_id: "editor-user", invited_role: "viewer" }]);
    await expect(authorizeClassificationAction(3, "activate_taxonomy"))
      .resolves.toMatchObject({ allowed: true, userId: "editor-user" });
  });

  it("calls the single atomic enqueue routine and maps its durable result", async () => {
    mocks.sql.mockResolvedValueOnce([
      { run_id: "12", run_state: "pending_taxonomy", taxonomy_version_id: null, created: true },
    ]);
    const result = await enqueueMessageClassification({
      chatbotId: 3,
      sessionId: 7,
      messageId: 9,
      content: "Help with an order",
      createdAt: "2026-01-01T00:00:00Z",
      idempotencyKey: "client-op-key-123456",
    });

    expect(result).toEqual({ runId: 12, state: "pending_taxonomy", taxonomyVersionId: null, created: true });
    expect(mocks.sql).toHaveBeenCalledOnce();
    const [query, ...parameters] = mocks.sql.mock.calls[0];
    expect(query.join("")).toContain("enqueue_classification_run");
    expect(parameters.slice(0, 6)).toEqual([
      3, 7, 9, "incoming", "incoming:9", "client-op-key-123456",
    ]);
    expect(JSON.parse(parameters[6])).toMatchObject({
      chatbotId: 3, sessionId: 7, messageId: 9,
      operationKind: "incoming", logicalOperationKey: "incoming:9",
      taxonomyBinding: "first_active_version_after_enqueue",
    });
    expect(parameters[7]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not report success when the persistence boundary returns no run", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    await expect(enqueueMessageClassification({
      chatbotId: 3, sessionId: 7, messageId: 9,
      content: "Question", createdAt: "2026-01-01T00:00:00Z",
    })).rejects.toThrow("did not return a durable run");
  });

  it("reconciles using the same natural operation key as request enqueue", async () => {
    mocks.sql
      .mockResolvedValueOnce([{
        chatbot_id: 3, session_id: 7, message_id: 9,
        content: "Question", created_at: "2026-01-01T00:00:00.000Z",
      }])
      .mockResolvedValueOnce([
        { run_id: 12, run_state: "queued", taxonomy_version_id: 4, created: false },
      ]);
    await expect(reconcileIncomingClassifications(10)).resolves.toBe(1);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    const [enqueueQuery, ...parameters] = mocks.sql.mock.calls[1];
    expect(enqueueQuery.join("")).toContain("enqueue_classification_run");
    expect(parameters[4]).toBe("incoming:9");
    expect(parameters[5]).toBe("reconcile:incoming:9");
  });
});

describe("classification migration structure", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "../../migrations/add_versioned_classification_v1.sql"),
    "utf8",
  );

  it("defines tenant-bound history, outbox, fencing, and first-activation binding", () => {
    expect(migration).toContain("UNIQUE (id, chatbot_id, message_id, taxonomy_version_id)");
    expect(migration).toContain("classification_one_running_attempt_per_run_uq");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("classification_outbox");
    expect(migration).toContain("first_active_version_after_enqueue");
    expect(migration.toLowerCase()).toContain("attempt lease is stale or expired");
  });

  it("preserves history through restricted foreign keys and mutation guards", () => {
    expect(migration).not.toMatch(/ON DELETE\s+CASCADE/i);
    expect(migration).toContain("classification_runs_no_delete");
    expect(migration).toContain("classification_decisions_no_mutation");
    expect(migration).toContain("classification_labels_no_mutation");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS archived_at");
  });
});
