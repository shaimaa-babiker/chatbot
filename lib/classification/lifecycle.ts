import type { ClassificationRun, ReviewState, TaxonomyProposal, TaxonomyVersion } from "./schemas";

export class InvalidClassificationTransition extends Error {
  constructor(from: string, to: string, entity: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidClassificationTransition";
  }
}
const taxonomyTransitions: Record<TaxonomyVersion["state"], readonly TaxonomyVersion["state"][]> = {
  draft: ["approved", "archived"],
  approved: ["active", "archived"],
  active: ["superseded"],
  superseded: ["archived"],
  archived: [],
};

export function assertTaxonomyTransition(from: TaxonomyVersion["state"], to: TaxonomyVersion["state"]): void {
  if (!taxonomyTransitions[from].includes(to)) {
    throw new InvalidClassificationTransition(from, to, "taxonomy");
  }
}

const proposalTransitions: Record<TaxonomyProposal["state"], readonly TaxonomyProposal["state"][]> = {
  draft: ["pending", "withdrawn"],
  pending: ["approved", "rejected", "withdrawn"],
  approved: ["applied", "stale", "withdrawn"],
  rejected: [],
  applied: [],
  withdrawn: [],
  stale: [],
};

export function assertProposalTransition(from: TaxonomyProposal["state"], to: TaxonomyProposal["state"]): void {
  if (!proposalTransitions[from].includes(to)) {
    throw new InvalidClassificationTransition(from, to, "proposal");
  }
}

const reviewTransitions: Record<ReviewState, readonly ReviewState[]> = {
  pending: ["accepted", "rejected", "flagged"],
  accepted: ["rejected", "flagged"],
  rejected: [],
  flagged: ["accepted", "rejected", "pending"],
};

export function assertReviewTransition(from: ReviewState, to: ReviewState): void {
  if (!reviewTransitions[from].includes(to)) {
    throw new InvalidClassificationTransition(from, to, "review");
  }
}

const runTransitions: Record<ClassificationRun["state"], readonly ClassificationRun["state"][]> = {
  pending_taxonomy: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["retryable_failed", "succeeded", "dead_letter", "cancelled"],
  retryable_failed: ["running", "dead_letter", "cancelled"],
  succeeded: [],
  dead_letter: [],
  cancelled: [],
};

export function assertRunTransition(from: ClassificationRun["state"], to: ClassificationRun["state"]): void {
  if (!runTransitions[from].includes(to)) {
    throw new InvalidClassificationTransition(from, to, "run");
  }
}

export function bindPendingRun(run: ClassificationRun, firstActivatedVersionId: number): ClassificationRun {
  if (run.state !== "pending_taxonomy" || run.taxonomyVersionId !== null) {
    throw new InvalidClassificationTransition(run.state, "queued", "run binding");
  }
  assertRunTransition(run.state, "queued");
  return { ...run, taxonomyVersionId: firstActivatedVersionId, state: "queued" };
}

export type Lease = { attemptId: number; fencingToken: string; expiresAt: string };

export function assertCurrentLease(current: Lease | null, supplied: Lease, now = Date.now()): void {
  const expiry = Date.parse(supplied.expiresAt);
  if (
    !current ||
    !Number.isInteger(supplied.attemptId) ||
    supplied.attemptId <= 0 ||
    !supplied.fencingToken ||
    !Number.isFinite(expiry) ||
    current.attemptId !== supplied.attemptId ||
    current.fencingToken !== supplied.fencingToken ||
    current.expiresAt !== supplied.expiresAt ||
    expiry <= now
  ) {
    throw new Error("Classification attempt lease is stale or expired");
  }
}

export function assertCanRetry(attemptCount: number, maxAttempts: number): void {
  if (!Number.isInteger(attemptCount) || !Number.isInteger(maxAttempts) || attemptCount < 0 || maxAttempts < 1) {
    throw new Error("Invalid retry counters");
  }
  if (attemptCount >= maxAttempts) throw new Error("Classification run has exhausted its attempts");
}
