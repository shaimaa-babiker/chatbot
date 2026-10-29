import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  provider: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  reconcile: vi.fn(),
  renew: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: mocks.sql }));
vi.mock("@/lib/groqPool", () => ({ callGroqChat: mocks.provider }));
vi.mock("../../../lib/classification/persistence", () => ({
  claimNextClassificationRun: mocks.claim,
  completeClassificationRun: mocks.complete,
  failClassificationRun: mocks.fail,
  reconcileIncomingClassifications: mocks.reconcile,
  renewClassificationLease: mocks.renew,
}));

import { runClassificationWorker } from "../../../lib/classification/worker";

const run = {
  runId: 81,
  attemptId: 92,
  fencingToken: "fence-token-test-123456",
  leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
  chatbotId: 3,
  sessionId: 7,
  messageId: 9,
  taxonomyVersionId: 4,
  operationIdentity: {
    messageContentDigest: createHash("sha256").update("Question").digest("hex"),
  },
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.reconcile.mockResolvedValue(0);
  mocks.claim.mockResolvedValue(run);
  mocks.sql
    .mockResolvedValueOnce([{ content: "Question", created_at: "2026-01-01T00:00:00Z" }])
    .mockResolvedValueOnce([{
      category_id: 11,
      name: "Orders",
      definition: "Questions about orders",
      inclusion_guidance: null,
      exclusion_guidance: null,
    }]);
  mocks.complete.mockResolvedValue(121);
  mocks.fail.mockResolvedValue("dead_letter");
});
describe("classification worker", () => {
  it("classifies against the run's taxonomy version and persists no fabricated confidence", async () => {
    mocks.provider.mockResolvedValue(JSON.stringify({
      outcome: "classified",
      confidence: null,
      labels: [{ categoryId: 11, rationale: "The message concerns an order." }],
    }));

    await expect(runClassificationWorker({ maxRuns: 1 })).resolves.toMatchObject({
      claimed: 1,
      succeeded: 1,
      deadLettered: 0,
    });
    expect(mocks.provider).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      runId: 81,
      attemptId: 92,
      fencingToken: run.fencingToken,
      outcome: "classified",
      confidence: null,
      labels: [{ categoryId: 11, rationale: "The message concerns an order." }],
    }));
    expect(mocks.sql.mock.calls[1][0].join(" ")).toContain("taxonomy_version_id");
  });

  it("dead-letters provider labels outside the bound taxonomy", async () => {
    mocks.provider.mockResolvedValue(JSON.stringify({
      outcome: "classified",
      confidence: null,
      labels: [{ categoryId: 999, rationale: "Unknown category." }],
    }));

    await expect(runClassificationWorker({ maxRuns: 1 })).resolves.toMatchObject({
      claimed: 1,
      succeeded: 0,
      deadLettered: 1,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(81, 92, run.fencingToken, "provider_returned_unknown_category", 30, false);
  });
});
