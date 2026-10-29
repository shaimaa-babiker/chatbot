import { z } from "zod";

const nonBlank = z.string().trim().min(1);
const positiveId = z.number().int().positive();
const confidence = z.number().min(0).max(1).nullable();

export const taxonomyVersionStateSchema = z.enum([
  "draft",
  "approved",
  "active",
  "superseded",
  "archived",
]);

export const taxonomyVersionSchema = z.object({
  chatbotId: positiveId,
  versionId: positiveId,
  versionNumber: positiveId,
  state: taxonomyVersionStateSchema,
});

export const stableCategorySchema = z.object({
  chatbotId: positiveId,
  categoryId: positiveId,
  createdAt: z.string().datetime(),
});

export const taxonomyCategorySchema = z.object({
  chatbotId: positiveId,
  versionId: positiveId,
  categoryId: positiveId,
  name: nonBlank.max(120),
  definition: nonBlank.max(2_000),
  inclusionGuidance: z.string().trim().max(2_000).nullable(),
  exclusionGuidance: z.string().trim().max(2_000).nullable(),
});

export const proposalTypeSchema = z.enum([
  "addition",
  "rename",
  "definition_change",
  "merge",
  "split",
  "retirement",
]);

export const proposalStateSchema = z.enum([
  "draft",
  "pending",
  "approved",
  "rejected",
  "applied",
  "withdrawn",
  "stale",
]);

export const taxonomyProposalSchema = z.object({
  id: positiveId,
  chatbotId: positiveId,
  baseVersionId: positiveId,
  type: proposalTypeSchema,
  state: proposalStateSchema,
  rationale: nonBlank.max(4_000),
  createdBy: nonBlank,
  createdAt: z.string().datetime(),
  reviewedBy: nonBlank.nullable(),
  reviewedAt: z.string().datetime().nullable(),
}).superRefine((proposal, ctx) => {
  const isReviewed = ["approved", "rejected", "applied", "stale"].includes(proposal.state);
  if (isReviewed !== (proposal.reviewedBy !== null && proposal.reviewedAt !== null)) {
    ctx.addIssue({ code: "custom", path: ["reviewedAt"], message: "Reviewed proposal states require reviewer and timestamp" });
  }
});

export const classificationRunStateSchema = z.enum([
  "pending_taxonomy",
  "queued",
  "running",
  "retryable_failed",
  "succeeded",
  "dead_letter",
  "cancelled",
]);

export const classificationRunSchema = z.object({
  id: positiveId,
  chatbotId: positiveId,
  sessionId: positiveId,
  messageId: positiveId,
  taxonomyVersionId: positiveId.nullable(),
  state: classificationRunStateSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: positiveId,
  idempotencyKey: nonBlank,
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((run, ctx) => {
  const pending = run.state === "pending_taxonomy";
  if (pending !== (run.taxonomyVersionId === null)) {
    ctx.addIssue({ code: "custom", path: ["taxonomyVersionId"], message: "Only pending-taxonomy runs may be unbound" });
  }
  if (run.attemptCount > run.maxAttempts) {
    ctx.addIssue({ code: "custom", path: ["attemptCount"], message: "Attempt count cannot exceed the configured maximum" });
  }
});

export const runAttemptSchema = z.object({
  id: positiveId,
  runId: positiveId,
  attemptNumber: positiveId,
  state: z.enum(["running", "succeeded", "failed", "abandoned"]),
  fencingToken: nonBlank,
  leaseExpiresAt: z.string().datetime().nullable(),
  modelVersion: z.string().nullable(),
  promptVersion: z.string().nullable(),
});

export const decisionOutcomeSchema = z.enum([
  "classified",
  "uncertain",
  "unclassified",
  "excluded",
]);

export const decisionLabelSchema = z.object({
  categoryId: positiveId,
  rationale: nonBlank.max(4_000),
});

export const classificationDecisionSchema = z.object({
  id: positiveId,
  runId: positiveId,
  chatbotId: positiveId,
  messageId: positiveId,
  taxonomyVersionId: positiveId,
  outcome: decisionOutcomeSchema,
  confidence,
  provenance: z.enum(["ai", "manual", "legacy_import"]),
  labels: z.array(decisionLabelSchema),
  createdAt: z.string().datetime(),
}).superRefine((decision, ctx) => {
  if (decision.outcome === "classified" && decision.labels.length === 0) {
    ctx.addIssue({ code: "custom", path: ["labels"], message: "Classified decisions require at least one label" });
  }
  if (decision.outcome !== "classified" && decision.labels.length !== 0) {
    ctx.addIssue({ code: "custom", path: ["labels"], message: "Only classified decisions may contain labels" });
  }
  const ids = decision.labels.map(({ categoryId }) => categoryId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["labels"], message: "A category may appear only once per decision" });
  }
});

export const reviewStateSchema = z.enum(["pending", "accepted", "rejected", "flagged"]);

export const canonicalSelectionSchema = z.object({
  chatbotId: positiveId,
  messageId: positiveId,
  taxonomyVersionId: positiveId,
  decisionId: positiveId.nullable(),
  generation: positiveId,
});

export const operationIdentitySchema = z.object({
  chatbotId: positiveId,
  operation: nonBlank,
  subjectId: positiveId,
  actorId: nonBlank,
  idempotencyKey: nonBlank.min(16).max(200),
  payload: z.record(z.string(), z.unknown()),
});

export type TaxonomyVersion = z.infer<typeof taxonomyVersionSchema>;
export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>;
export type TaxonomyProposal = z.infer<typeof taxonomyProposalSchema>;
export type ClassificationRun = z.infer<typeof classificationRunSchema>;
export type RunAttempt = z.infer<typeof runAttemptSchema>;
export type ClassificationDecision = z.infer<typeof classificationDecisionSchema>;
export type ClassificationOutcome = z.infer<typeof decisionOutcomeSchema>;
export type DecisionLabel = z.infer<typeof decisionLabelSchema>;
export type ReviewState = z.infer<typeof reviewStateSchema>;
export type CanonicalSelection = z.infer<typeof canonicalSelectionSchema>;
export type ProposalType = z.infer<typeof proposalTypeSchema>;
