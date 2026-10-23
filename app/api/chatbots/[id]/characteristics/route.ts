import sql from "@/lib/db";
import { isOwnerOfAnyChatbot } from "@/lib/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json({ error: "Only chatbot owners can manage chatbot settings" }, { status: 403 });
  }

  const { id } = await context.params;
  const chatbotId = Number(id);
  if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
    return NextResponse.json({ error: "Invalid chatbot id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  try {
    const rows = await sql`
      INSERT INTO chatbot_characteristics (chatbot_id, content, created_at)
      SELECT id, ${content}, NOW()
      FROM chatbots
      WHERE id = ${chatbotId} AND clerk_user_id = ${userId}
      RETURNING id, chatbot_id, content, created_at
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("[/api/chatbots] add characteristic failed", error);
    return NextResponse.json({ error: "Failed to add characteristic" }, { status: 500 });
  }
}
