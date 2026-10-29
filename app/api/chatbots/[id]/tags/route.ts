import sql from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };
type TagCategory = "product" | "service" | "opportunity";

function parseIds(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTag(body: unknown): {
  name: string;
  purpose: string;
  category: TagCategory;
} | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.name !== "string" ||
    typeof value.purpose !== "string" ||
    (value.category !== "product" &&
      value.category !== "service" &&
      value.category !== "opportunity")
  ) {
    return null;
  }
  const name = value.name.trim();
  const purpose = value.purpose.trim();
  if (!name || name.length > 50 || !purpose || purpose.length > 300) return null;
  return { name, purpose, category: value.category };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function POST(request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const chatbotId = parseIds((await context.params).id);
  if (!chatbotId) {
    return NextResponse.json({ error: "Invalid chatbot id" }, { status: 400 });
  }
  const tag = parseTag(await request.json().catch(() => null));
  if (!tag) {
    return NextResponse.json(
      { error: "Enter a tag name, purpose, and valid category" },
      { status: 400 },
    );
  }

  try {
    const rows = await sql`
      INSERT INTO chatbot_tags (chatbot_id, name, purpose, category)
      SELECT id, ${tag.name}, ${tag.purpose}, ${tag.category}
      FROM chatbots
      WHERE id = ${chatbotId}
        AND clerk_user_id = ${userId}
        AND archived_at IS NULL
      RETURNING id, name, purpose, category
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A tag with this name already exists for this chatbot" },
        { status: 409 },
      );
    }
    console.error("[/api/chatbots] add tag failed", error);
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}
