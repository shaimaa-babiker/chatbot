import sql from "@/lib/db"
import { getChatbot, getSessionDetails } from "@/lib/chatData"
import { applyConfiguredTagsToMessage } from "@/lib/messageTagging"
import {
  getGuestSessionCapability,
  hasGuestSessionCapability,
} from "@/lib/guestSessionCapability"
import { callGroqChat, callGroqChatStream } from "@/lib/groqPool"
import { sendAdminNewMessageDigest } from "@/lib/email"
import { type NextRequest } from "next/server"

const IDLE_BEFORE_NOTIFY_MS = 5 * 60 * 1000
const REARM_AFTER_NOTIFY_MS = 60 * 60 * 1000

// In-memory dedupe so a single chat session cannot email the admin more than
// once per REARM window. Vercel reuses function instances across requests, so
// this Map persists for the lifetime of the warm instance.
const notifiedRecently = new Map<number, number>()

function appBaseUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_VERCEL_URL
  if (explicit) return explicit
  const envUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  if (envUrl) {
    return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`
  }
  const origin = req.headers.get("origin")
  if (origin) return origin
  return "http://localhost:3000"
}

async function maybeNotifyAdmin({
  chatSessionId,
  chatbotId,
  baseUrl,
}: {
  chatSessionId: number
  chatbotId: number
  baseUrl: string
}): Promise<void> {
  try {
    console.log("[notify] start", { chatSessionId, chatbotId })

    const lastNotifiedAt = notifiedRecently.get(chatSessionId)
    if (lastNotifiedAt) {
      const sinceMs = Date.now() - lastNotifiedAt
      if (sinceMs < REARM_AFTER_NOTIFY_MS) {
        console.log("[notify] session already notified within rearm window, skipping", {
          chatSessionId,
          sinceSec: Math.round(sinceMs / 1000),
        })
        return
      }
      notifiedRecently.delete(chatSessionId)
    }

    const ctx = await getSessionDetails(chatSessionId)
    if (!ctx) {
      console.warn("[notify] no session context found", { chatSessionId })
      return
    }

    const allMessages = (ctx.messages ?? []).slice().sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const lastMessage = allMessages[allMessages.length - 1]
    if (!lastMessage) {
      console.log("[notify] no messages yet, skipping", { chatSessionId })
      return
    }

    const idleMs = Date.now() - new Date(lastMessage.created_at).getTime()
    if (idleMs < IDLE_BEFORE_NOTIFY_MS) {
      console.log("[notify] chat not idle yet, skipping", {
        chatSessionId,
        idleMs,
        idleSec: Math.round(idleMs / 1000),
      })
      return
    }

    const hasUserMessage = allMessages.some((m: any) => m.sender === "user")
    if (!hasUserMessage) {
      console.log("[notify] no user messages, skipping", { chatSessionId })
      return
    }

    console.log("[notify] sending digest", {
      chatSessionId,
      messageCount: allMessages.length,
      idleSec: Math.round(idleMs / 1000),
    })

    const result = await sendAdminNewMessageDigest({
      chatbotName: ctx.chatbot.name ?? "your chatbot",
      guestName: ctx.guest?.name ?? null,
      guestEmail: ctx.guest?.email ?? null,
      sessionId: chatSessionId,
      sessionCreatedAt: ctx.created_at,
      appBaseUrl: baseUrl,
    })

    if (!result.ok) {
      console.warn("[notify] email send failed:", result.error)
      return
    }

    notifiedRecently.set(chatSessionId, Date.now())
    console.log("[notify] admin digest sent", { id: result.id, chatSessionId })
  } catch (error) {
    console.error("[notify] unexpected error:", error)
  }
}

const MAX_PREVIOUS_MESSAGES = 20

function sseEvent(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return new TextEncoder().encode(payload)
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonError("Invalid request", 400)
  }

  const { name, chat_session_id, chabot_id, content, created_at, stream } = body

  if (typeof name !== "string" || name.trim().length === 0) {
    console.warn("[send-message] 400: invalid name", { name })
    return jsonError("Name is required", 400)
  }
  if (
    typeof chat_session_id !== "number" ||
    !Number.isInteger(chat_session_id) ||
    chat_session_id <= 0
  ) {
    console.warn("[send-message] 400: invalid chat_session_id", { chat_session_id, type: typeof chat_session_id })
    return jsonError("Invalid chat_session_id", 400)
  }
  if (
    typeof chabot_id !== "number" ||
    !Number.isInteger(chabot_id) ||
    chabot_id <= 0
  ) {
    console.warn("[send-message] 400: invalid chabot_id", { chabot_id, type: typeof chabot_id })
    return jsonError("Invalid chabot_id", 400)
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    console.warn("[send-message] 400: invalid content", { content })
    return jsonError("Message content is required", 400)
  }
  if (typeof created_at !== "string") {
    console.warn("[send-message] 400: invalid created_at", { created_at, type: typeof created_at })
    return jsonError("created_at is required", 400)
  }
  if (stream !== undefined && typeof stream !== "boolean") {
    console.warn("[send-message] 400: invalid stream", { stream, type: typeof stream })
    return jsonError("stream must be a boolean", 400)
  }

  let isAuthorized = false
  try {
    isAuthorized = await hasGuestSessionCapability(
      chat_session_id,
      getGuestSessionCapability(req),
    )
  } catch (error) {
    console.error("[send-message] capability verification failed", error)
    return jsonError("Failed to verify chat session", 500)
  }
  if (!isAuthorized) {
    return jsonError("Chat session not found", 404)
  }

  // Resolve chatbot ownership from the authorized session, not the request body.
  let chatbot, session
  try {
    session = await getSessionDetails(chat_session_id)
    if (!session) return jsonError("Chat session not found", 404)
    if (session.chatbot_id !== chabot_id) {
      return jsonError("Chat session not found", 404)
    }
    chatbot = await getChatbot(session.chatbot_id)
    if (!chatbot) return jsonError("Chat session not found", 404)
  } catch (error) {
    console.error("Error verifying chat context:", error)
    return jsonError("Failed to verify chat context", 500)
  }

  const previousMessages = (session.messages ?? [])
    .slice(-MAX_PREVIOUS_MESSAGES)
    .map<{ role: "user" | "assistant"; content: string }>((m) => ({
      role: m.sender === "ai" ? "assistant" : "user",
      content: m.content,
    }))

  const systemPrompt = (chatbot.chatbot_characteristics ?? [])
    .map((c) => c.content)
    .join("\n")

  const messages = [
    {
      role: "system" as const,
      content: `You are the assistant for this chatbot, speaking with ${name.trim()}.
Keep each answer concise and within 500 tokens.

Chatbot characteristics:
${systemPrompt || "(no characteristics provided)"}`,
    },
    ...previousMessages,
    { role: "user" as const, content },
  ]

  // Persist the user message first so it's saved even if the AI call fails.
  let userMessageId: number | null = null
  try {
    const insertedMessage = await sql`
      INSERT INTO messages (chat_session_id, content, created_at, sender)
      VALUES (${chat_session_id}, ${content}, ${created_at}, 'user')
      RETURNING id
    `
    if (!insertedMessage[0]?.id) {
      throw new Error("User message insert did not return an id")
    }
    userMessageId = Number(insertedMessage[0].id)
  } catch (error) {
    console.error("Error persisting user message:", error)
    return jsonError("Failed to persist user message", 500)
  }

  try {
    await applyConfiguredTagsToMessage({
      chatbotId: session.chatbot_id,
      messageId: userMessageId,
      message: content,
    })
  } catch (error) {
    console.error("[send-message] failed to apply configured message tags", {
      chatbotId: session.chatbot_id,
      messageId: userMessageId,
      error,
    })
  }

  // ---------- Streaming response path ----------
  if (stream) {
    const encoder = new TextEncoder()
    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulated = ""
        try {
          for await (const token of callGroqChatStream(messages, {
            maxTokens: 500,
            temperature: 0.7,
          })) {
            accumulated += token
            controller.enqueue(sseEvent("token", { delta: token }))
          }
        } catch (error) {
          console.error("Groq streaming error:", error)
          // Fall back to a single polite apology so the UI never hangs.
          const fallback =
            "I apologize, but I encountered an issue processing your request. Please try again in a moment."
          accumulated = accumulated || fallback
          controller.enqueue(sseEvent("token", { delta: fallback }))
        }

        // Persist the AI response and emit a `done` event with the row id.
        try {
          const aiMessage = await sql`
            INSERT INTO messages (chat_session_id, content, created_at, sender)
            VALUES (${chat_session_id}, ${accumulated}, NOW(), 'ai')
            RETURNING id
          `
          const aiMessageId = aiMessage[0]?.id
          controller.enqueue(
            sseEvent("done", {
              id: aiMessageId,
              content: accumulated,
            }),
          )

          // Fire-and-forget admin notification. The user response should not
          // wait on email delivery; errors are logged inside the helper.
          void maybeNotifyAdmin({
            chatSessionId: chat_session_id,
            chatbotId: session.chatbot_id,
            baseUrl: appBaseUrl(req),
          })
        } catch (error) {
          console.error("Error persisting AI message:", error)
          controller.enqueue(
            sseEvent("error", { message: "Failed to save AI response" }),
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  }

  // ---------- Non-streaming fallback path ----------
  try {
    const aiResponse = await callGroqChat(messages, {
      maxTokens: 500,
      temperature: 0.7,
    })
    const aiMessage = await sql`
      INSERT INTO messages (chat_session_id, content, created_at, sender)
      VALUES (${chat_session_id}, ${aiResponse}, NOW(), 'ai')
      RETURNING id
    `

    void maybeNotifyAdmin({
      chatSessionId: chat_session_id,
      chatbotId: session.chatbot_id,
      baseUrl: appBaseUrl(req),
    })

    return new Response(
      JSON.stringify({
        id: aiMessage[0]?.id,
        content: aiResponse,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error("Error Sending Message:", error)
    return new Response(
      JSON.stringify({
        error: "An error occurred while processing your message",
        content:
          "I'm sorry, but I encountered an error. Please try again later.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
