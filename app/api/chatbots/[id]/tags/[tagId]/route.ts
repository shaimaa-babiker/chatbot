import sql from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

type Context = { params: Promise<{ id: string; tagId: string }> };
type TagCategory = "product" | "service" | "opportunity";

function parseId(value: string): number | null {
  const parsed = Number(value);
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

export async function PATCH(request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = await context.params;
  const chatbotId = parseId(params.id);
  const tagId = parseId(params.tagId);
  if (!chatbotId || !tagId) {
    return NextResponse.json({ error: "Invalid chatbot or tag id" }, { status: 400 });
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
      UPDATE chatbot_tags t
      SET name = ${tag.name}, purpose = ${tag.purpose},
          category = ${tag.category}, updated_at = NOW()
      FROM chatbots c
      WHERE t.id = ${tagId}
        AND t.chatbot_id = ${chatbotId}
        AND t.is_active = TRUE
        AND c.id = t.chatbot_id
        AND c.clerk_user_id = ${userId}
        AND c.archived_at IS NULL
      RETURNING t.id, t.name, t.purpose, t.category
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A tag with this name already exists for this chatbot" },
        { status: 409 },
      );
    }
    console.error("[/api/chatbots] update tag failed", error);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = await context.params;
  const chatbotId = parseId(params.id);
  const tagId = parseId(params.tagId);
  if (!chatbotId || !tagId) {
    return NextResponse.json({ error: "Invalid chatbot or tag id" }, { status: 400 });
  }

  try {
    const rows = await sql`
      UPDATE chatbot_tags t
      SET is_active = FALSE, updated_at = NOW()
      FROM chatbots c
      WHERE t.id = ${tagId}
        AND t.chatbot_id = ${chatbotId}
        AND t.is_active = TRUE
        AND c.id = t.chatbot_id
        AND c.clerk_user_id = ${userId}
        AND c.archived_at IS NULL
      RETURNING t.id
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[/api/chatbots] delete tag failed", error);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
