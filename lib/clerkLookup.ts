import { clerkClient } from "@clerk/nextjs/server";

/**
 * Look up a Clerk user by their primary email address.
 * Returns null if the user does not exist (e.g. has not signed up yet).
 *
 * Used by the admin-users invite flow so the invite API can store the
 * invited user's clerk_user_id at invite time. The /review-sessions access
 * helper also uses email-based lookup as a fallback for invites created
 * before the user existed.
 */
export async function findClerkUserIdByEmail(
  email: string,
): Promise<string | null> {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  const client = await clerkClient();
  const list = await client.users.getUserList({ emailAddress: [trimmed] });
  const user = list.data[0];
  return user?.id ?? null;
}

/**
 * Batch variant: resolve a list of emails to Clerk user_ids. Emails that
 * don't match a user come back as null in the same array position. Used by
 * the admin-users listing to enrich invites that were created before the
 * invitee signed up.
 */
export async function resolveClerkUserIdsByEmails(
  emails: string[],
): Promise<(string | null)[]> {
  if (emails.length === 0) return [];
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase())));
  const client = await clerkClient();
  const list = await client.users.getUserList({ emailAddress: unique });
  const byEmail = new Map<string, string>();
  for (const user of list.data) {
    const primary = user.primaryEmailAddress?.emailAddress?.toLowerCase();
    if (primary) byEmail.set(primary, user.id);
    for (const addr of user.emailAddresses ?? []) {
      byEmail.set(addr.emailAddress.toLowerCase(), user.id);
    }
  }
  return emails.map((email) => byEmail.get(email.trim().toLowerCase()) ?? null);
}