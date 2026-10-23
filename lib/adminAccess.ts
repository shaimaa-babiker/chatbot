import sql from "@/lib/db";
import { currentUser } from "@clerk/nextjs/server";

/**
 * Returns true if `userId` is allowed to view chat sessions for `chatbotId`.
 * Allowed when:
 *   - The user is the chatbot owner (chatbots.clerk_user_id === userId), OR
 *   - The user's email is in admin_users invited by that owner.
 */
export async function canReviewSessionsForChatbot(
  userId: string,
  chatbotId: number,
): Promise<boolean> {
  const owner = await getChatbotOwner(chatbotId);
  if (!owner) return false;
  if (owner === userId && await isOwnerOfAnyChatbot(userId)) return true;

  const ownerIds = await getOwnerIdsForUser(userId);
  return ownerIds.has(owner);
}

/**
 * Returns true if the user is an owner rather than an editor invitee.
 */
export async function isOwnerOfAnyChatbot(userId: string): Promise<boolean> {
  try {
    if (await isEditorInvitee()) return false;

    const rows = await sql`
      SELECT id
      FROM chatbots
      WHERE clerk_user_id = ${userId}
      LIMIT 1
    `;
    return rows.length > 0;
  } catch (error) {
    console.error("[adminAccess] chatbot ownership query failed", error);
    return false;
  }
}

export async function isEditorInvitee(): Promise<boolean> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return false;

  const rows = await sql`
    SELECT id
    FROM admin_users
    WHERE LOWER(invited_email) = ${email.trim().toLowerCase()}
      AND role = 'editor'
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Returns the owner clerk_user_id of the chatbot, or null if not found.
 */
export async function getChatbotOwner(
  chatbotId: number,
): Promise<string | null> {
  const rows = await sql`
    SELECT clerk_user_id
    FROM chatbots
    WHERE id = ${chatbotId}
    LIMIT 1
  `;
  return rows[0]?.clerk_user_id ?? null;
}

/**
 * Returns the set of owner_clerk_user_ids that have invited this user.
 * Access is matched purely by email — no Clerk user_id required on the invite.
 */
export async function getOwnerIdsForUser(userId: string): Promise<Set<string>> {
  const ownerIds = new Set<string>();

  try {
    // Look up the signed-in user's primary email via Clerk.
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return ownerIds;

    const lowerEmail = email.trim().toLowerCase();

    // Query admin_users by email directly from NeonDB.
    const rows = await sql`
      SELECT owner_clerk_user_id, role
      FROM admin_users
      WHERE LOWER(invited_email) = ${lowerEmail}
    `;

    for (const invite of rows) {
      ownerIds.add(invite.owner_clerk_user_id);
    }
  } catch (error) {
    console.warn("[adminAccess] getOwnerIdsForUser failed", error);
  }

  return ownerIds;
}

/**
 * Returns the role of the invited user for a given owner's chatbots.
 * Returns null if no invite exists.
 */
export async function getRoleForUser(
  userId: string,
  ownerClerkUserId: string,
): Promise<"editor" | "viewer" | null> {
  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return null;

    const lowerEmail = email.trim().toLowerCase();

    const rows = await sql`
      SELECT role FROM admin_users
      WHERE LOWER(invited_email) = ${lowerEmail}
        AND owner_clerk_user_id = ${ownerClerkUserId}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) return null;
    return rows[0].role as "editor" | "viewer";
  } catch (error) {
    console.warn("[adminAccess] getRoleForUser failed", error);
    return null;
  }
}

/**
 * Returns the global role of the signed-in user:
 *   'owner'  — owns at least one chatbot and is not invited as an editor
 *   'editor' — invited as editor, even if they own a chatbot
 *   'viewer' — invited as viewer but does not own any chatbot
 *   null     — not invited anywhere, treat as fresh owner/no access
 */
export async function getMyGlobalRole(
  userId: string,
): Promise<"owner" | "editor" | "viewer" | null> {
  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    const rows = email ? await sql`
      SELECT role FROM admin_users
      WHERE LOWER(invited_email) = ${email.trim().toLowerCase()}
      ORDER BY CASE WHEN role = 'editor' THEN 0 ELSE 1 END, created_at DESC
    ` as { role: string }[] : [];

    if (rows.some(({ role }) => role === "editor")) return "editor";
    if (await isOwnerOfAnyChatbot(userId)) return "owner";
    if (rows.some(({ role }) => role === "viewer")) return "viewer";
    return null;
  } catch (error) {
    console.warn("[adminAccess] getMyGlobalRole failed", error);
    return null;
  }
}