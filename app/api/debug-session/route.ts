import { NextRequest, NextResponse } from "next/server";
import { getSessionDetails } from "@/lib/chatData";
import { auth } from "@clerk/nextjs/server";
import { canReviewSessionsForChatbot } from "@/lib/adminAccess";

/**
 * Diagnostic endpoint for the notification system.
 *
 * GET /api/debug-session?sessionId=42
 *   Returns the full session context the email helper would see.
 *
 * GET /api/debug-session?sessionId=42&reset=1
 *   No-op: with the in-memory dedupe map there is nothing to reset on the
 *   server side. The dedupe naturally re-arms after 60 minutes.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const sessionId = Number(url.searchParams.get("sessionId"));

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "sessionId must be a positive integer" }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await getSessionDetails(sessionId);
  } catch (error) {
    console.error("[/api/debug-session] database query failed", error);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }

  if (!ctx) {
    return NextResponse.json(
      { error: "Session not found", sessionId },
      { status: 404 },
    );
  }
  if (!(await canReviewSessionsForChatbot(userId, ctx.chatbot.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allMessages = (ctx.messages ?? [])
    .slice()
    .sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const lastMessage = allMessages[allMessages.length - 1];

  return NextResponse.json({
    sessionId,
    messageCount: ctx.messages?.length ?? 0,
    lastMessage: lastMessage ?? null,
    guest: ctx.guest,
    chatbot: ctx.chatbot,
    note:
      "Dedupe is now in-memory and re-arms after 60 minutes. There is no DB column to reset.",
  });
}