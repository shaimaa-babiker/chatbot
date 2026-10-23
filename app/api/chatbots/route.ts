import sql from "@/lib/db";
import { isEditorInvitee } from "@/lib/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let editorInvitee: boolean;
  try {
    editorInvitee = await isEditorInvitee();
  } catch (error) {
    console.error("[/api/chatbots] editor role check failed", error);
    return NextResponse.json({ error: "Failed to verify account role" }, { status: 500 });
  }
  if (editorInvitee) {
    return NextResponse.json(
      { error: "Editor invitees cannot create chatbots" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const rows = await sql`
      INSERT INTO chatbots (clerk_user_id, name, created_at)
      VALUES (${userId}, ${name}, NOW())
      RETURNING id, name, created_at, clerk_user_id
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("[/api/chatbots] create failed", error);
    return NextResponse.json({ error: "Failed to create chatbot" }, { status: 500 });
  }
}
