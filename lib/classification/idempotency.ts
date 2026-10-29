import { createHash } from "node:crypto";
import { operationIdentitySchema } from "./schemas";

export type OperationIdentity = ReturnType<typeof operationIdentitySchema.parse>;

function canonicalize(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new Error("Operation payload must contain JSON values only");
  if (ancestors.has(value)) throw new Error("Operation payload cannot contain cycles");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalize(item, ancestors));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error("Operation payload must contain plain JSON objects only");
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}
export function canonicalOperationIdentity(input: OperationIdentity): string {
  const identity = operationIdentitySchema.parse(input);
  return JSON.stringify(canonicalize(identity));
}

export function operationPayloadDigest(input: OperationIdentity): string {
  return createHash("sha256").update(canonicalOperationIdentity(input), "utf8").digest("hex");
}

export function assertIdempotentRetry(existing: OperationIdentity, retry: OperationIdentity): void {
  if (canonicalOperationIdentity(existing) !== canonicalOperationIdentity(retry)) {
    throw new Error("Idempotency key was reused for a different logical operation");
  }
}
