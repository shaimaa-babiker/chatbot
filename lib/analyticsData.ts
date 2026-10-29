import sql from "@/lib/db";

export type AnalyticsPeriod = "day" | "week" | "month" | "year";
export type AnalyticsSender = "all" | "user" | "ai";
export type LeadCategory = "product" | "service" | "opportunity";
export type MessageAnalyticsBucket = {
  period: string;
  categories: { category: string; count: number }[];
  total: number;
};

export type AnalyticsMatchedMessage = {
  id: number;
  sessionId: number;
  content: string;
  sender: "user" | "ai";
  createdAt: string;
  guestName: string | null;
  guestEmail: string | null;
  tags: string[];
  categories: LeadCategory[];
};

export type FilteredMessagePage = {
  messages: AnalyticsMatchedMessage[];
  page: number;
  hasMore: boolean;
};

export const leadCategories: { value: LeadCategory; label: string }[] = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "opportunity", label: "Opportunity" },
];

const lookbackDays: Record<AnalyticsPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asLeadCategoryArray(value: unknown): LeadCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is LeadCategory =>
      item === "product" || item === "service" || item === "opportunity",
  );
}

function asMessageSender(value: unknown): "user" | "ai" {
  if (value !== "user" && value !== "ai") {
    throw new Error(`Unexpected message sender: ${String(value)}`);
  }
  return value;
}

export async function getFilteredMessages({
  userId,
  email,
  period,
  sender,
  category,
  tag,
  chatbotId,
  page,
}: {
  userId: string;
  email: string | null;
  period: AnalyticsPeriod;
  sender: AnalyticsSender;
  category: LeadCategory | "all";
  tag: string;
  chatbotId: number;
  page: number;
}): Promise<FilteredMessagePage> {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const lookback = lookbackDays[period];
  const pageSize = 50;
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    throw new Error("page must be an integer between 1 and 1000000");
  }
  const offset = (page - 1) * pageSize;

  const rows = await sql`
    SELECT
      m.id,
      m.chat_session_id,
      m.content,
      m.sender,
      m.created_at,
      g.name AS guest_name,
      g.email AS guest_email,
      COALESCE(
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL),
        ARRAY[]::text[]
      ) AS tags,
      COALESCE(
        array_agg(DISTINCT t.category) FILTER (WHERE t.id IS NOT NULL),
        ARRAY[]::text[]
      ) AS categories
    FROM messages m
    JOIN chat_sessions s ON s.id = m.chat_session_id
    JOIN chatbots c ON c.id = s.chatbot_id
    LEFT JOIN guests g ON g.id = s.guest_id
    LEFT JOIN message_tags mt ON mt.message_id = m.id
    LEFT JOIN chatbot_tags t ON t.id = mt.tag_id
    WHERE s.chatbot_id = ${chatbotId}
      AND (
        c.clerk_user_id = ${userId}
        OR EXISTS (
          SELECT 1
          FROM admin_users a
          WHERE a.owner_clerk_user_id = c.clerk_user_id
            AND LOWER(a.invited_email) = ${normalizedEmail}
        )
      )
      AND m.created_at >= NOW() - (${lookback} * INTERVAL '1 day')
      AND (${sender} = 'all' OR m.sender = ${sender})
      AND (
        ${category} = 'all'
        OR EXISTS (
          SELECT 1
          FROM message_tags filtered_mt
          JOIN chatbot_tags filtered_t ON filtered_t.id = filtered_mt.tag_id
          WHERE filtered_mt.message_id = m.id
            AND filtered_t.category = ${category}
        )
      )
      AND (
        ${tag} = 'all'
        OR EXISTS (
          SELECT 1
          FROM message_tags filtered_mt
          JOIN chatbot_tags filtered_t ON filtered_t.id = filtered_mt.tag_id
          WHERE filtered_mt.message_id = m.id
            AND filtered_t.name = ${tag}
        )
      )
    GROUP BY m.id, m.chat_session_id, m.content, m.sender, m.created_at,
      g.name, g.email
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${pageSize + 1}
    OFFSET ${offset}
  `;

  const hasMore = rows.length > pageSize;
  return {
    page,
    hasMore,
    messages: rows.slice(0, pageSize).map((row) => ({
      id: Number(row.id),
      sessionId: Number(row.chat_session_id),
      content: String(row.content),
      sender: asMessageSender(row.sender),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      guestName: row.guest_name === null ? null : String(row.guest_name),
      guestEmail: row.guest_email === null ? null : String(row.guest_email),
      tags: asStringArray(row.tags),
      categories: asLeadCategoryArray(row.categories),
    })),
  };
}

export async function getAvailableTags({
  userId,
  email,
  chatbotId,
}: {
  userId: string;
  email: string | null;
  chatbotId: number;
}): Promise<string[]> {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const rows = await sql`
    SELECT DISTINCT t.name
    FROM chatbot_tags t
    JOIN chatbots c ON c.id = t.chatbot_id
    WHERE t.chatbot_id = ${chatbotId}
      AND t.is_active = TRUE
      AND (
        c.clerk_user_id = ${userId}
        OR EXISTS (
          SELECT 1
          FROM admin_users a
          WHERE a.owner_clerk_user_id = c.clerk_user_id
            AND LOWER(a.invited_email) = ${normalizedEmail}
        )
      )
    ORDER BY t.name
  `;
  return rows.map((row) => String(row.name));
}

export async function getMessageAnalytics({
  userId,
  email,
  period,
  sender,
  category,
  tag,
  chatbotId,
}: {
  userId: string;
  email: string | null;
  period: AnalyticsPeriod;
  sender: AnalyticsSender;
  category: LeadCategory | "all";
  tag: string;
  chatbotId: number;
}): Promise<MessageAnalyticsBucket[]> {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const lookback = lookbackDays[period];

  const rows = await sql`
    WITH scoped_messages AS (
      SELECT DISTINCT
        m.id,
        date_trunc(${period}, m.created_at)::date AS period_start
      FROM messages m
      JOIN chat_sessions s ON s.id = m.chat_session_id
      JOIN chatbots c ON c.id = s.chatbot_id
      WHERE s.chatbot_id = ${chatbotId}
        AND (
          c.clerk_user_id = ${userId}
          OR EXISTS (
            SELECT 1
            FROM admin_users a
            WHERE a.owner_clerk_user_id = c.clerk_user_id
              AND LOWER(a.invited_email) = ${normalizedEmail}
          )
        )
        AND m.created_at >= NOW() - (${lookback} * INTERVAL '1 day')
        AND (${sender} = 'all' OR m.sender = ${sender})
        AND (
          ${category} = 'all'
          OR EXISTS (
            SELECT 1
            FROM message_tags mt
            JOIN chatbot_tags t ON t.id = mt.tag_id
            WHERE mt.message_id = m.id AND t.category = ${category}
          )
        )
        AND (
          ${tag} = 'all'
          OR EXISTS (
            SELECT 1
            FROM message_tags mt
            JOIN chatbot_tags t ON t.id = mt.tag_id
            WHERE mt.message_id = m.id AND t.name = ${tag}
          )
        )
    ),
    period_totals AS (
      SELECT period_start, COUNT(*)::int AS total
      FROM scoped_messages
      GROUP BY period_start
    ),
    category_totals AS (
      SELECT scoped.period_start, COALESCE(t.category, 'untagged') AS category,
             COUNT(DISTINCT scoped.id)::int AS count
      FROM scoped_messages scoped
      LEFT JOIN message_tags mt ON mt.message_id = scoped.id
      LEFT JOIN chatbot_tags t ON t.id = mt.tag_id
      WHERE (${category} = 'all' OR t.category = ${category})
        AND (${tag} = 'all' OR t.name = ${tag})
      GROUP BY scoped.period_start, COALESCE(t.category, 'untagged')
    )
    SELECT totals.period_start::text AS period, categories.category,
           categories.count, totals.total
    FROM period_totals totals
    JOIN category_totals categories USING (period_start)
    ORDER BY totals.period_start DESC, categories.category
  `;

  const buckets = new Map<string, MessageAnalyticsBucket>();
  for (const row of rows) {
    const periodKey = String(row.period);
    let bucket = buckets.get(periodKey);
    if (!bucket) {
      bucket = { period: periodKey, categories: [], total: Number(row.total) };
      buckets.set(periodKey, bucket);
    }
    bucket.categories.push({
      category: String(row.category),
      count: Number(row.count),
    });
  }

  return Array.from(buckets.values());
}
