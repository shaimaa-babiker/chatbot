import sql from "@/lib/db";
import { isOwnerOfAnyChatbot } from "@/lib/adminAccess";
import { sendInviteEmail } from "@/lib/email";
import { auth, currentUser } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

const VALID_ROLES = ["editor", "viewer"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * POST /api/admin-users/invite
 * Body: { email: string; role?: 'editor' | 'viewer' }
 *
 * Owner-only. Inserts a row into admin_users directly via NeonDB SQL,
 * bypassing StepZen entirely for this write operation.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json(
      { error: "Only chatbot owners can invite team members" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { email, role: rawRole } = body as {
    email?: unknown;
    role?: unknown;
  };

  const trimmedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!trimmedEmail) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Validate role — default to 'viewer' if not provided or invalid.
  const role: Role =
    typeof rawRole === "string" && VALID_ROLES.includes(rawRole as Role)
      ? (rawRole as Role)
      : "viewer";

  try {
    if (role === "editor") {
      const user = await currentUser();
      const inviterEmail = user?.primaryEmailAddress?.emailAddress
        ?.trim()
        .toLowerCase();
      if (inviterEmail === trimmedEmail) {
        return NextResponse.json(
          { error: "You cannot invite yourself as an editor" },
          { status: 400 },
        );
      }
    }

    // Direct SQL insert into NeonDB — no StepZen dependency for writes.
    const rows = await sql`
      INSERT INTO admin_users (owner_clerk_user_id, invited_email, role, created_at)
      VALUES (${userId}, ${trimmedEmail}, ${role}, NOW())
      ON CONFLICT (owner_clerk_user_id, invited_email) DO NOTHING
      RETURNING id, owner_clerk_user_id, invited_email, role, created_at
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "This person is already invited" },
        { status: 409 },
      );
    }

    // Send the invitation email after the access row has been committed.
    // Prefer the explicitly configured public URL so the email link is never "localhost".
    const origin =
      process.env.NEXT_PUBLIC_VERCEL_URL ||
      req.headers.get("origin") ||
      req.nextUrl.origin ||
      "http://localhost:3000";
    const emailResult = await sendInviteEmail({
      invitedEmail: trimmedEmail,
      role,
      appBaseUrl: origin,
    });
    if (!emailResult.ok) {
      console.error("[/api/admin-users/invite] invitation saved but email failed", emailResult.error);
    }

    return NextResponse.json({
      ok: true,
      emailSent: emailResult.ok,
      admin: rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/admin-users/invite] db error", message);

    // Unique constraint violation fallback
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json(
        { error: "This person is already invited" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}