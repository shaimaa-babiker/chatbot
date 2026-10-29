import sql from "@/lib/db";
import { normalizeWidgetConfig } from "@/lib/widgetConfig";
import { NextRequest, NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const chatbotId = Number(id);
  if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
    return NextResponse.json({ error: "Invalid chatbot id" }, { status: 400 });
  }

  try {
    const chatbots = await sql`
      SELECT name, widget_config
      FROM chatbots
      WHERE id = ${chatbotId} AND archived_at IS NULL
      LIMIT 1
    `;
    if (!chatbots.length) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    return NextResponse.json({
      name: chatbots[0].name,
      widget_config: normalizeWidgetConfig(chatbots[0].widget_config),
    });
  } catch (error) {
    console.error("[/api/chatbots/[id]/name] fetch failed", error);
    return NextResponse.json({ error: "Failed to load chatbot" }, { status: 500 });
  }
}
