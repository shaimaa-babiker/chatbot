import { auth, currentUser } from "@clerk/nextjs/server";
import sql from "@/lib/db";
import {
  canPerformClassificationAction,
  type ClassificationAction,
  type ChatbotMembership,
} from "./authorization";

/**
 * Resolves a chatbot-scoped role from Clerk and persisted owner/invitation data.
 * Call only from a trusted server route/action. IDs from request bodies are
 * lookup selectors, never proof of identity or permission.
 */
export async function authorizeClassificationAction(
  chatbotId: number,
  action: ClassificationAction,
): Promise<{ allowed: boolean; userId: string | null }> {
  if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
    return { allowed: false, userId: null };
  }
  const { userId } = await auth();
  if (!userId) return { allowed: false, userId: null };

  const email = (await currentUser())?.primaryEmailAddress?.emailAddress
    ?.trim()
    .toLowerCase();
  const rows = await sql`
    SELECT c.clerk_user_id AS owner_user_id, a.role AS invited_role
    FROM chatbots c
    LEFT JOIN admin_users a
      ON a.owner_clerk_user_id = c.clerk_user_id
     AND LOWER(a.invited_email) = ${email ?? ""}
    WHERE c.id = ${chatbotId}
    LIMIT 1
  `;
  if (!rows.length) return { allowed: false, userId };

  const invitedRole = rows[0].invited_role;
  const membership: ChatbotMembership = {
    chatbotId,
    ownerUserId: String(rows[0].owner_user_id),
    invitedRole: invitedRole === "editor" || invitedRole === "viewer" ? invitedRole : null,
  };
  return {
    allowed: canPerformClassificationAction({ kind: "clerk", userId }, membership, action),
    userId,
  };
}
