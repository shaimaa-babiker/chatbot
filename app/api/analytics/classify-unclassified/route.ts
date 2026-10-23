import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getReviewableChatbots, getChatbot } from "@/lib/chatData";
import { classifyEnquiry } from "@/lib/enquiryClassification";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 5;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("chatbotId" in body) ||
      typeof body.chatbotId !== "number" ||
      !Number.isInteger(body.chatbotId) ||
      body.chatbotId <= 0
    ) {
      return NextResponse.json(
        { error: "A valid chatbotId is required" },
        { status: 400 },
      );
    }
    const chatbotId = body.chatbotId;
    const user = await currentUser();
    const reviewableChatbots = await getReviewableChatbots(
      userId,
      user?.primaryEmailAddress?.emailAddress ?? null,
    );
    const chatbot = reviewableChatbots.find((item) => item.id === chatbotId);
    if (!chatbot) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    const chatbotDetails = await getChatbot(chatbot.id);
    if (!chatbotDetails) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    let classified = 0;
    let failed = 0;
    let remaining = 0;
    let failureReason: string | null = null;

    const knowledge = chatbotDetails.chatbot_characteristics
      .map((characteristic) => characteristic.content)
      .join("\n");
    const knownRows = await sql`
      SELECT DISTINCT m.enquiry_category
      FROM messages m
      JOIN chat_sessions s ON s.id = m.chat_session_id
      WHERE s.chatbot_id = ${chatbot.id}
        AND m.sender = 'user'
        AND m.enquiry_category IS NOT NULL
      ORDER BY m.enquiry_category
      LIMIT 50
    `;
    const knownCategories = knownRows.map((row) =>
      String(row.enquiry_category),
    );
    const messages = await sql`
      SELECT m.id, m.content
      FROM messages m
      JOIN chat_sessions s ON s.id = m.chat_session_id
      WHERE s.chatbot_id = ${chatbot.id}
        AND m.sender = 'user'
        AND m.enquiry_category IS NULL
      ORDER BY m.created_at, m.id
      LIMIT ${BATCH_LIMIT}
    `;

    for (const message of messages) {
      try {
        const category = await classifyEnquiry({
          knowledge,
          message: String(message.content),
          knownCategories,
        });
        await sql`
          UPDATE messages
          SET enquiry_category = ${category}
          WHERE id = ${Number(message.id)}
            AND enquiry_category IS NULL
        `;
        classified += 1;
        if (!knownCategories.includes(category)) {
          knownCategories.push(category);
        }
      } catch (error) {
        failed += 1;
        console.error("[analytics] failed to classify existing message", {
          messageId: message.id,
          chatbotId: chatbot.id,
          error,
        });
        const messageText =
          error instanceof Error ? error.message : "Unknown error";
        const statusMatch = messageText.match(/Groq error (\d{3})/);
        if (messageText.includes("No Groq API keys configured")) {
          failureReason = "No Groq API key is configured on the server.";
        } else if (
          statusMatch?.[1] === "401" ||
          statusMatch?.[1] === "403"
        ) {
          failureReason =
            "Groq rejected the server API key. Check the GROQ_API_KEY environment setting.";
        } else if (
          statusMatch?.[1] === "429" ||
          messageText.includes("rate-limited")
        ) {
          failureReason =
            "Groq is rate-limiting requests. Wait briefly, then try again.";
        } else if (statusMatch) {
          failureReason = `Groq returned an API error (${statusMatch[1]}). Check the server logs for details.`;
        } else if (messageText.includes("Groq returned")) {
          failureReason =
            "Groq returned a category the app could not read. Check the server logs for the response.";
        } else {
          failureReason =
            "The classification request failed. Check the server logs for details.";
        }
        break;
      }
    }

    const remainingRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM messages m
      JOIN chat_sessions s ON s.id = m.chat_session_id
      WHERE s.chatbot_id = ${chatbot.id}
        AND m.sender = 'user'
        AND m.enquiry_category IS NULL
    `;
    remaining = Number(remainingRows[0]?.count ?? 0);

    return NextResponse.json({
      classified,
      failed,
      remaining,
      failureReason,
    });
  } catch (error) {
    console.error("[analytics] failed to classify unclassified messages", error);
    return NextResponse.json(
      { error: "Could not classify existing messages" },
      { status: 500 },
    );
  }
}
