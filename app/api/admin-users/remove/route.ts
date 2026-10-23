import sql from "@/lib/db";
import { isOwnerOfAnyChatbot } from "@/lib/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin-users/remove
 * Body: { id: number }
 *
 * Owner-only. Verifies the caller owns the invite, then deletes the row
 * directly via NeonDB SQL — no StepZen dependency.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json({ error: "Only chatbot owners can manage team members" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "id must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    // Fetch the invite to verify ownership before deleting.
    const rows = await sql`
      SELECT id, owner_clerk_user_id FROM admin_users WHERE id = ${id} LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (rows[0].owner_clerk_user_id !== userId) {
      return NextResponse.json(
        { error: "You can only remove admins you invited" },
        { status: 403 },
      );
    }

    // Delete the row.
    await sql`DELETE FROM admin_users WHERE id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/admin-users/remove] db error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}