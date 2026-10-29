import type {
  CanonicalSelection,
  ClassificationDecision,
  ClassificationRun,
  TaxonomyProposal,
  TaxonomyVersion,
} from "./schemas";

export type EnqueueClassificationInput = {
  chatbotId: number;
  sessionId: number;
  messageId: number;
  idempotencyKey: string;
  payloadDigest: string;
};
export type ReviewDecisionInput = {
  chatbotId: number;
  decisionId: number;
  action: "accept" | "reject" | "flag" | "unflag";
  expectedState: "pending" | "accepted" | "rejected" | "flagged";
  idempotencyKey: string;
  reason: string;
};

export type CanonicalSelectionInput = {
  chatbotId: number;
  messageId: number;
  taxonomyVersionId: number;
  decisionId: number | null;
  expectedGeneration: number;
  idempotencyKey: string;
  reason: string;
};

/** Persistence boundary only. Implementations must not report success before durable commit. */
export interface ClassificationService {
  enqueue(input: EnqueueClassificationInput): Promise<ClassificationRun>;
  process(runId: number): Promise<ClassificationDecision>;
  review(input: ReviewDecisionInput): Promise<void>;
  selectCanonical(input: CanonicalSelectionInput): Promise<CanonicalSelection>;
  createTaxonomyDraft(chatbotId: number): Promise<TaxonomyVersion>;
  editTaxonomyDraft(chatbotId: number, versionId: number, categories: TaxonomyCategoryInput[]): Promise<TaxonomyVersion>;
  approveTaxonomy(chatbotId: number, versionId: number): Promise<TaxonomyVersion>;
  activateTaxonomy(chatbotId: number, versionId: number): Promise<TaxonomyVersion>;
  archiveTaxonomy(chatbotId: number, versionId: number): Promise<TaxonomyVersion>;
  submitProposal(proposal: TaxonomyProposal): Promise<TaxonomyProposal>;
  reviewProposal(chatbotId: number, proposalId: number, action: "approve" | "reject", reason: string): Promise<TaxonomyProposal>;
  applyProposal(chatbotId: number, proposalId: number): Promise<TaxonomyVersion>;
  requestHistoricalPreview(chatbotId: number, versionId: number): Promise<{ previewId: number; scopeDigest: string }>;
  approveHistoricalExecution(chatbotId: number, previewId: number): Promise<void>;
  executeHistoricalReclassification(chatbotId: number, previewId: number): Promise<ClassificationRun[]>;
  requestPurge(chatbotId: number, subjectId: number): Promise<{ requestId: number }>;
}

export type TaxonomyCategoryInput = {
  categoryId: number | null;
  name: string;
  definition: string;
  inclusionGuidance: string | null;
  exclusionGuidance: string | null;
};
