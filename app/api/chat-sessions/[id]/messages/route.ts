import sql from "@/lib/db";
import {
  getGuestSessionCapability,
  hasGuestSessionCapability,
} from "@/lib/guestSessionCapability";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const unavailable = () =>
    NextResponse.json(
      { error: "Session unavailable" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );

  try {
    if (
      !(await hasGuestSessionCapability(
        sessionId,
        getGuestSessionCapability(request),
      ))
    ) {
      return unavailable();
    }

    const messages = await sql`
      SELECT id, chat_session_id, content, created_at, sender
      FROM messages
      WHERE chat_session_id = ${sessionId}
      ORDER BY created_at, id
    `;
    return NextResponse.json(messages, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[/api/chat-sessions] messages query failed", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}
