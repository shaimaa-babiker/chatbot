import sql from "@/lib/db";
import { type NextRequest, NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { name, email, chatbot_id } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (typeof chatbot_id !== 'number' || !Number.isInteger(chatbot_id) || chatbot_id <= 0) {
    return NextResponse.json({ error: 'chatbot_id must be a positive integer' }, { status: 400 });
  }

  try {
    const rows = await sql`
      WITH valid_chatbot AS (
        SELECT id FROM chatbots WHERE id = ${chatbot_id}
      ),
      new_guest AS (
        INSERT INTO guests (created_at, email, name)
        SELECT NOW(), ${email.trim()}, ${name.trim()}
        WHERE EXISTS (SELECT 1 FROM valid_chatbot)
        RETURNING id
      ),
      new_session AS (
        INSERT INTO chat_sessions (chatbot_id, guest_id, created_at)
        SELECT valid_chatbot.id, new_guest.id, NOW()
        FROM valid_chatbot CROSS JOIN new_guest
        RETURNING id
      ),
      welcome_message AS (
        INSERT INTO messages (chat_session_id, content, created_at, sender)
        SELECT id, ${`Welcome ${name.trim()}!\nHow can I assist you today?`}, NOW(), 'ai'
        FROM new_session
        RETURNING id
      )
      SELECT id AS chat_session_id FROM new_session
    `;
    if (!rows.length) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }
    return NextResponse.json({ chat_session_id: rows[0].chat_session_id });
  } catch (error) {
    console.error('[/api/start-chat] error', error);
    return NextResponse.json(
      { error: 'Failed to start chat. Please try again.' },
      { status: 500 },
    );
  }
}
