import sql from "@/lib/db";
import { isEditorInvitee, isOwnerOfAnyChatbot } from "@/lib/adminAccess";
import { isValidWidgetConfig, normalizeWidgetConfig } from "@/lib/widgetConfig";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

async function parseId(params: Context["params"]) {
  const { id } = await params;
  const chatbotId = Number(id);
  return Number.isInteger(chatbotId) && chatbotId > 0 ? chatbotId : null;
}

export async function GET(_request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (await isEditorInvitee()) {
    return NextResponse.json(
      { error: "Editor invitees cannot manage chatbot settings" },
      { status: 403 },
    );
  }
  const chatbotId = await parseId(context.params);
  if (!chatbotId) {
    return NextResponse.json({ error: "Invalid chatbot id" }, { status: 400 });
  }

  try {
    const chatbots = await sql`
      SELECT id, name, created_at, widget_config
      FROM chatbots
      WHERE id = ${chatbotId}
        AND clerk_user_id = ${userId}
        AND archived_at IS NULL
      LIMIT 1
    `;
    if (!chatbots.length) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    const chatbot = chatbots[0];
    const characteristics = await sql`
      SELECT id, chatbot_id, content, created_at
      FROM chatbot_characteristics
      WHERE chatbot_id = ${chatbotId}
      ORDER BY created_at, id
    `;
    const tags = await sql`
      SELECT id, name, purpose, category
      FROM chatbot_tags
      WHERE chatbot_id = ${chatbotId} AND is_active = TRUE
      ORDER BY created_at, id
    `;
    return NextResponse.json({
      ...chatbot,
      widget_config: normalizeWidgetConfig(chatbot.widget_config),
      chatbot_characteristics: characteristics,
      tags,
    });
  } catch (error) {
    console.error("[/api/chatbots] fetch failed", error);
    return NextResponse.json({ error: "Failed to load chatbot" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json({ error: "Only chatbot owners can manage chatbots" }, { status: 403 });
  }
  const chatbotId = await parseId(context.params);
  if (!chatbotId) {
    return NextResponse.json({ error: "Invalid chatbot id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const widgetConfig = body?.widget_config;
  if (name === undefined && widgetConfig === undefined) {
    return NextResponse.json({ error: "No chatbot settings provided" }, { status: 400 });
  }
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (widgetConfig !== undefined && !isValidWidgetConfig(widgetConfig)) {
    return NextResponse.json({ error: "Invalid chat appearance settings" }, { status: 400 });
  }

  try {
    const rows = name !== undefined && widgetConfig !== undefined
      ? await sql`
          UPDATE chatbots SET name = ${name}, widget_config = ${JSON.stringify(widgetConfig)}::jsonb
          WHERE id = ${chatbotId} AND clerk_user_id = ${userId} AND archived_at IS NULL
          RETURNING id, name, created_at, widget_config
        `
      : name !== undefined
        ? await sql`
            UPDATE chatbots SET name = ${name}
            WHERE id = ${chatbotId} AND clerk_user_id = ${userId} AND archived_at IS NULL
            RETURNING id, name, created_at, widget_config
          `
        : await sql`
            UPDATE chatbots SET widget_config = ${JSON.stringify(widgetConfig)}::jsonb
            WHERE id = ${chatbotId} AND clerk_user_id = ${userId} AND archived_at IS NULL
            RETURNING id, name, created_at, widget_config
          `;
    if (!rows.length) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...rows[0],
      widget_config: normalizeWidgetConfig(rows[0].widget_config),
    });
  } catch (error) {
    console.error("[/api/chatbots] update failed", error);
    return NextResponse.json({ error: "Failed to update chatbot" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerOfAnyChatbot(userId))) {
    return NextResponse.json({ error: "Only chatbot owners can manage chatbots" }, { status: 403 });
  }
  const chatbotId = await parseId(context.params);
  if (!chatbotId) {
    return NextResponse.json({ error: "Invalid chatbot id" }, { status: 400 });
  }

  try {
    const rows = await sql`
      UPDATE chatbots SET archived_at = COALESCE(archived_at, NOW())
      WHERE id = ${chatbotId} AND clerk_user_id = ${userId}
        AND archived_at IS NULL
      RETURNING id
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    return NextResponse.json({ id: rows[0].id });
  } catch (error) {
    console.error("[/api/chatbots] delete failed", error);
    return NextResponse.json({ error: "Failed to delete chatbot" }, { status: 500 });
  }
}
