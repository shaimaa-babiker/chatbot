import { describe, expect, it } from "vitest";
import {
  classificationDecisionSchema,
  operationIdentitySchema,
  type ClassificationRun,
} from "../../../lib/classification/schemas";
import {
  assertCanRetry,
  assertCurrentLease,
  assertReviewTransition,
  assertRunTransition,
  assertTaxonomyTransition,
  bindPendingRun,
} from "../../../lib/classification/lifecycle";
import { assertIdempotentRetry, operationPayloadDigest } from "../../../lib/classification/idempotency";
import { canPerformClassificationAction } from "../../../lib/classification/authorization";

describe("classification data contracts", () => {
  it("requires rationale for every label and classified outcomes to have labels", () => {
    const base = {
      id: 1, runId: 2, chatbotId: 3, messageId: 4, taxonomyVersionId: 5,
      outcome: "classified", confidence: null, provenance: "ai", createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(classificationDecisionSchema.safeParse({ ...base, labels: [] }).success).toBe(false);
    expect(classificationDecisionSchema.safeParse({ ...base, labels: [{ categoryId: 8, rationale: " " }] }).success).toBe(false);
    expect(classificationDecisionSchema.safeParse({ ...base, labels: [{ categoryId: 8, rationale: "Billing question" }] }).success).toBe(true);
  });
  it("rejects labels on explicit non-classified outcomes and duplicate labels", () => {
    const common = {
      id: 1, runId: 2, chatbotId: 3, messageId: 4, taxonomyVersionId: 5,
      confidence: 1.2, provenance: "manual", createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(classificationDecisionSchema.safeParse({ ...common, outcome: "uncertain", labels: [{ categoryId: 1, rationale: "x" }] }).success).toBe(false);
    expect(classificationDecisionSchema.safeParse({ ...common, confidence: null, outcome: "classified", labels: [{ categoryId: 1, rationale: "x" }, { categoryId: 1, rationale: "y" }] }).success).toBe(false);
  });
});

describe("classification lifecycle", () => {
  it("allows only declared taxonomy, review, and run transitions", () => {
    expect(() => assertTaxonomyTransition("draft", "approved")).not.toThrow();
    expect(() => assertTaxonomyTransition("active", "draft")).toThrow();
    expect(() => assertReviewTransition("flagged", "accepted")).not.toThrow();
    expect(() => assertReviewTransition("rejected", "accepted")).toThrow();
    expect(() => assertRunTransition("succeeded", "queued")).toThrow();
  });

  it("binds a pending run once and rejects rebinding", () => {
    const pending = {
      id: 1, chatbotId: 2, sessionId: 3, messageId: 4, taxonomyVersionId: null,
      state: "pending_taxonomy", attemptCount: 0, maxAttempts: 3,
      idempotencyKey: "incoming-1", payloadDigest: "a".repeat(64),
    } satisfies ClassificationRun;
    const bound = bindPendingRun(pending, 9);
    expect(bound).toMatchObject({ state: "queued", taxonomyVersionId: 9 });
    expect(() => bindPendingRun(bound, 10)).toThrow();
  });

  it("rejects exhausted retries and stale or expired leases", () => {
    expect(() => assertCanRetry(2, 3)).not.toThrow();
    expect(() => assertCanRetry(3, 3)).toThrow();
    const live = { attemptId: 7, fencingToken: "fence-a", expiresAt: "2030-01-01T00:00:00.000Z" };
    expect(() => assertCurrentLease(live, live, Date.parse("2029-01-01T00:00:00.000Z"))).not.toThrow();
    expect(() => assertCurrentLease(live, { ...live, fencingToken: "fence-old" }, Date.parse("2029-01-01T00:00:00.000Z"))).toThrow();
    expect(() => assertCurrentLease(live, live, Date.parse("2031-01-01T00:00:00.000Z"))).toThrow();
  });
});

describe("authorization policy", () => {
  const membership = { chatbotId: 10, ownerUserId: "owner", invitedRole: null } as const;

  it("restricts taxonomy approval and historical execution to the owner", () => {
    expect(canPerformClassificationAction({ kind: "clerk", userId: "editor" }, { ...membership, invitedRole: "editor" }, "review_decision")).toBe(true);
    expect(canPerformClassificationAction({ kind: "clerk", userId: "editor" }, { ...membership, invitedRole: "editor" }, "approve_taxonomy")).toBe(false);
    expect(canPerformClassificationAction({ kind: "clerk", userId: "owner" }, membership, "approve_taxonomy")).toBe(true);
  });

  it("keeps viewers and guests out of administrative actions", () => {
    expect(canPerformClassificationAction({ kind: "clerk", userId: "viewer" }, { ...membership, invitedRole: "viewer" }, "select_canonical")).toBe(false);
    expect(canPerformClassificationAction({ kind: "guest_capability", sessionId: 1, capabilityVerified: true }, membership, "review_decision")).toBe(false);
    expect(canPerformClassificationAction({ kind: "guest_capability", sessionId: 1, capabilityVerified: true }, membership, "process_run")).toBe(false);
    expect(canPerformClassificationAction({ kind: "worker", serviceName: "classification-worker" }, membership, "process_run")).toBe(true);
  });
});

describe("operation idempotency contract", () => {
  const operation = operationIdentitySchema.parse({
    chatbotId: 3, operation: "review:accept", subjectId: 7, actorId: "user-1",
    idempotencyKey: "client-operation-key-0001", payload: { reason: "confirmed", expectedState: "pending" },
  });

  it("canonicalizes object key order and rejects changed logical operations", () => {
    const reordered = { ...operation, payload: { expectedState: "pending", reason: "confirmed" } };
    expect(operationPayloadDigest(operation)).toBe(operationPayloadDigest(reordered));
    expect(() => assertIdempotentRetry(operation, reordered)).not.toThrow();
    expect(() => assertIdempotentRetry(operation, { ...operation, payload: { reason: "different" } })).toThrow();
    expect(() => assertIdempotentRetry(operation, { ...operation, chatbotId: 4 })).toThrow();
  });
});
