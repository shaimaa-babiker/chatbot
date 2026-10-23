import sql from "@/lib/db";
import { isOwnerOfAnyChatbot } from "@/lib/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

async function characteristicId(params: Context["params"]) {
  const { id } = await params;
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json({ error: "Only chatbot owners can manage chatbot settings" }, { status: 403 });
  }
  const id = await characteristicId(context.params);
  if (!id) {
    return NextResponse.json({ error: "Invalid characteristic id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  try {
    const rows = await sql`
      UPDATE chatbot_characteristics AS characteristics
      SET content = ${content}
      FROM chatbots
      WHERE characteristics.id = ${id}
        AND chatbots.id = characteristics.chatbot_id
        AND chatbots.clerk_user_id = ${userId}
      RETURNING characteristics.id, characteristics.chatbot_id, characteristics.content, characteristics.created_at
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Characteristic not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("[/api/characteristics] update failed", error);
    return NextResponse.json({ error: "Failed to update characteristic" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json({ error: "Only chatbot owners can manage chatbot settings" }, { status: 403 });
  }
  const id = await characteristicId(context.params);
  if (!id) {
    return NextResponse.json({ error: "Invalid characteristic id" }, { status: 400 });
  }

  try {
    const rows = await sql`
      DELETE FROM chatbot_characteristics AS characteristics
      USING chatbots
      WHERE characteristics.id = ${id}
        AND chatbots.id = characteristics.chatbot_id
        AND chatbots.clerk_user_id = ${userId}
      RETURNING characteristics.id
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Characteristic not found" }, { status: 404 });
    }
    return NextResponse.json({ id: rows[0].id });
  } catch (error) {
    console.error("[/api/characteristics] delete failed", error);
    return NextResponse.json({ error: "Failed to delete characteristic" }, { status: 500 });
  }
}
