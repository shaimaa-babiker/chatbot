export type ClassificationAction =
  | "request_classification"
  | "review_decision"
  | "select_canonical"
  | "propose_taxonomy"
  | "approve_taxonomy"
  | "activate_taxonomy"
  | "request_historical_reclassification"
  | "approve_historical_reclassification"
  | "execute_historical_reclassification"
  | "execute_purge"
  | "process_run";

export type TrustedClassificationPrincipal =
  | { kind: "clerk"; userId: string }
  | { kind: "guest_capability"; sessionId: number; capabilityVerified: true }
  | { kind: "worker"; serviceName: string }
  | { kind: "purge_executor"; serviceName: string };

export type ChatbotMembership = {
  chatbotId: number;
  ownerUserId: string;
  invitedRole: "editor" | "viewer" | null;
};

/**
 * Pure policy decision. `principal` and `membership` must be resolved by trusted
 * server code (for example Clerk `auth()` plus a chatbot-scoped DB lookup),
 * never copied from request JSON. This function does not authenticate callers.
 */
export function canPerformClassificationAction(
  principal: TrustedClassificationPrincipal | null,
  membership: ChatbotMembership,
  action: ClassificationAction,
): boolean {
  if (!principal) return false;
  if (action === "process_run") return principal.kind === "worker";
  if (action === "execute_purge") return principal.kind === "purge_executor";
  if (principal.kind !== "clerk") return false;

  const isOwner = principal.userId === membership.ownerUserId;
  const role = isOwner ? "owner" : membership.invitedRole;
  if (role === "viewer" || role === null) return false;

  switch (action) {
    case "approve_taxonomy":
    case "activate_taxonomy":
    case "approve_historical_reclassification":
    case "execute_historical_reclassification":
      return role === "owner";
    case "request_classification":
    case "review_decision":
    case "select_canonical":
    case "propose_taxonomy":
    case "request_historical_reclassification":
      return role === "owner" || role === "editor";
    default:
      return false;
  }
}
