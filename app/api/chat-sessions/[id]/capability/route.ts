import sql from "@/lib/db";
import {
  getGuestSessionCapability,
  rotateGuestSessionCapability,
} from "@/lib/guestSessionCapability";
import { canReviewSessionsForChatbot } from "@/lib/adminAccess";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

function parseSessionId(id: string): number | null {
  const sessionId = Number(id);
  return Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = parseSessionId(id);
  if (!sessionId) {
    return NextResponse.json({ error: "Session unavailable" }, { status: 404 });
  }

  try {
    const capability = await rotateGuestSessionCapability(
      sessionId,
      getGuestSessionCapability(request),
    );
    if (!capability) {
      return NextResponse.json(
        { error: "Session unavailable" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { capability: capability.token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[/api/chat-sessions] capability rotation failed", error);
    return NextResponse.json(
      { error: "Failed to rotate session capability" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const sessionId = parseSessionId(id);
  if (!sessionId) {
    return NextResponse.json({ error: "Session unavailable" }, { status: 404 });
  }

  try {
    const sessions = await sql`
      SELECT chatbot_id
      FROM chat_sessions
      WHERE id = ${sessionId}
      LIMIT 1
    `;
    const chatbotId = Number(sessions[0]?.chatbot_id);
    if (!sessions.length || !Number.isInteger(chatbotId) || chatbotId <= 0) {
      return NextResponse.json({ error: "Session unavailable" }, { status: 404 });
    }
    if (!(await canReviewSessionsForChatbot(userId, chatbotId))) {
      return NextResponse.json({ error: "Session unavailable" }, { status: 404 });
    }

    await sql`
      UPDATE chat_sessions
      SET guest_capability_revoked_at = NOW()
      WHERE id = ${sessionId}
    `;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[/api/chat-sessions] capability revocation failed", error);
    return NextResponse.json(
      { error: "Failed to revoke session capability" },
      { status: 500 },
    );
  }
}
