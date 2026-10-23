import sql from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Diagnostic endpoint. Reports:
 *   - The signed-in Clerk userId
 *   - Chatbots owned by the signed-in Clerk user
 *
 * Hit:
 *   /api/debug-owner            → formatted summary
 *   /api/debug-owner?raw=1      → raw database query rows
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("raw") === "1";

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const owned = await sql`
    SELECT id, clerk_user_id FROM chatbots WHERE clerk_user_id = ${userId}
  `;
  const totalRows = await sql`SELECT COUNT(*)::int AS count FROM chatbots`;

  if (raw) {
    return NextResponse.json({
      signedInAs: userId,
      owned,
      totalChatbots: totalRows[0]?.count ?? 0,
    });
  }

  const ownedIds = owned.map((b) => b.id);

  return NextResponse.json({
    signedInAs: userId,
    ownedChatbots: ownedIds.length,
    ownedIds,
    totalChatbots: totalRows[0]?.count ?? 0,
  });
}