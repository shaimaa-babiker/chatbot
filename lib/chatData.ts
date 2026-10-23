import sql from "@/lib/db";
import type { Chatbot, Message } from "@/types/types";

function asDateString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asMessage(row: Record<string, unknown>): Message {
  if (row.sender !== "ai" && row.sender !== "user") {
    throw new Error(`Unexpected message sender: ${String(row.sender)}`);
  }
  return {
    id: Number(row.id),
    chat_session_id: Number(row.chat_session_id),
    content: String(row.content),
    created_at: asDateString(row.created_at),
    sender: row.sender,
  };
}

export async function getChatbot(chatbotId: number): Promise<Chatbot | null> {
  const rows = await sql`
    SELECT id, name, clerk_user_id, created_at
    FROM chatbots
    WHERE id = ${chatbotId}
    LIMIT 1
  `;
  if (!rows.length) return null;

  const chatbot = rows[0];
  const characteristics = await sql`
    SELECT id, chatbot_id, content, created_at
    FROM chatbot_characteristics
    WHERE chatbot_id = ${chatbotId}
    ORDER BY created_at, id
  `;
  return {
    id: Number(chatbot.id),
    name: String(chatbot.name),
    clerk_user_id: String(chatbot.clerk_user_id),
    created_at: asDateString(chatbot.created_at),
    chatbot_characteristics: characteristics.map((row) => ({
      id: Number(row.id),
      chatbot_id: Number(row.chatbot_id),
      content: String(row.content),
      created_at: asDateString(row.created_at),
    })),
    chat_sessions: [],
    messages: [],
  };
}

export async function getOwnedChatbots(userId: string): Promise<Chatbot[]> {
  const rows = await sql`
    SELECT id, name, clerk_user_id, created_at
    FROM chatbots
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return attachSessions(rows);
}

export async function getReviewableChatbots(
  userId: string,
  email: string | null,
): Promise<Chatbot[]> {
  const rows = email
    ? await sql`
        SELECT c.id, c.name, c.clerk_user_id, c.created_at
        FROM chatbots c
        WHERE c.clerk_user_id = ${userId}
           OR EXISTS (
             SELECT 1 FROM admin_users a
             WHERE a.owner_clerk_user_id = c.clerk_user_id
               AND LOWER(a.invited_email) = ${email.trim().toLowerCase()}
           )
        ORDER BY c.created_at DESC
      `
    : await sql`
        SELECT id, name, clerk_user_id, created_at
        FROM chatbots
        WHERE clerk_user_id = ${userId}
        ORDER BY created_at DESC
      `;
  return attachSessions(rows);
}

async function attachSessions(chatbotRows: Record<string, unknown>[]): Promise<Chatbot[]> {
  return Promise.all(chatbotRows.map(async (chatbot) => {
    const sessions = await sql`
      SELECT s.id, s.chatbot_id, s.guest_id, s.created_at,
        g.id AS joined_guest_id, g.name AS guest_name, g.email AS guest_email,
        g.created_at AS guest_created_at
      FROM chat_sessions s
      LEFT JOIN guests g ON g.id = s.guest_id
      WHERE s.chatbot_id = ${Number(chatbot.id)}
      ORDER BY s.created_at DESC
    `;
    return {
      id: Number(chatbot.id),
      name: String(chatbot.name),
      clerk_user_id: String(chatbot.clerk_user_id),
      created_at: asDateString(chatbot.created_at),
      chatbot_characteristics: [],
      chat_sessions: sessions.map((session) => ({
        id: Number(session.id),
        chatbot_id: Number(session.chatbot_id),
        guest_id: session.guest_id === null ? null : Number(session.guest_id),
        created_at: asDateString(session.created_at),
        guests: session.joined_guest_id
          ? {
              id: Number(session.joined_guest_id),
              created_at: asDateString(session.guest_created_at),
              name: session.guest_name === null ? null : String(session.guest_name),
              email: session.guest_email === null ? null : String(session.guest_email),
            }
          : null,
        messages: [],
      })),
      messages: [],
    };
  }));
}

export type SessionDetails = {
  id: number;
  chatbot_id: number;
  guest_id: number | null;
  created_at: string;
  chatbot: { id: number; name: string; clerk_user_id: string };
  guest: { id: number; name: string | null; email: string | null } | null;
  messages: Message[];
};

export async function getSessionDetails(sessionId: number): Promise<SessionDetails | null> {
  const rows = await sql`
    SELECT s.id, s.chatbot_id, s.guest_id, s.created_at,
      c.name AS chatbot_name, c.clerk_user_id,
      g.id AS joined_guest_id, g.name AS guest_name, g.email AS guest_email,
      g.created_at AS guest_created_at
    FROM chat_sessions s
    JOIN chatbots c ON c.id = s.chatbot_id
    LEFT JOIN guests g ON g.id = s.guest_id
    WHERE s.id = ${sessionId}
    LIMIT 1
  `;
  if (!rows.length) return null;

  const row = rows[0];
  const messages = await sql`
    SELECT id, chat_session_id, content, created_at, sender
    FROM messages
    WHERE chat_session_id = ${sessionId}
    ORDER BY created_at, id
  `;
  return {
    id: Number(row.id),
    chatbot_id: Number(row.chatbot_id),
    guest_id: row.guest_id === null ? null : Number(row.guest_id),
    created_at: asDateString(row.created_at),
    chatbot: {
      id: Number(row.chatbot_id),
      name: String(row.chatbot_name),
      clerk_user_id: String(row.clerk_user_id),
    },
    guest: row.joined_guest_id
      ? {
          id: Number(row.joined_guest_id),
          name: row.guest_name === null ? null : String(row.guest_name),
          email: row.guest_email === null ? null : String(row.guest_email),
        }
      : null,
    messages: messages.map(asMessage),
  };
}
