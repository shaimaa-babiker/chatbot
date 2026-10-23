import sql from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const sessions = await sql`
      SELECT id FROM chat_sessions WHERE id = ${sessionId} LIMIT 1
    `;
    if (!sessions.length) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const messages = await sql`
      SELECT id, chat_session_id, content, created_at, sender
      FROM messages
      WHERE chat_session_id = ${sessionId}
      ORDER BY created_at, id
    `;
    return NextResponse.json(messages);
  } catch (error) {
    console.error("[/api/chat-sessions] messages query failed", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}
