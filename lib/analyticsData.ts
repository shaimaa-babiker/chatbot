import sql from "@/lib/db";

export type AnalyticsPeriod = "day" | "month" | "year";
export type AnalyticsSender = "all" | "user" | "ai";
export type EnquiryCategory = string;

export type MessageAnalyticsBucket = {
  period: string;
  categories: { category: string; count: number }[];
  total: number;
};

const lookbackDays: Record<AnalyticsPeriod, number> = {
  day: 30,
  month: 365,
  year: 365 * 5,
};

export async function getAvailableEnquiryCategories({
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
    SELECT DISTINCT COALESCE(NULLIF(m.enquiry_category, ''), 'Unclassified') AS category
    FROM messages m
    JOIN chat_sessions s ON s.id = m.chat_session_id
    WHERE s.chatbot_id = ${chatbotId}
      AND EXISTS (
        SELECT 1
        FROM chatbots c
        WHERE c.id = s.chatbot_id
          AND (
            c.clerk_user_id = ${userId}
            OR EXISTS (
              SELECT 1
              FROM admin_users a
              WHERE a.owner_clerk_user_id = c.clerk_user_id
                AND LOWER(a.invited_email) = ${normalizedEmail}
            )
          )
      )
    ORDER BY category
  `;
  return rows.map((row) => String(row.category));
}

export async function getMessageAnalytics({
  userId,
  email,
  period,
  sender,
  category,
  chatbotId,
}: {
  userId: string;
  email: string | null;
  period: AnalyticsPeriod;
  sender: AnalyticsSender;
  category: EnquiryCategory;
  chatbotId: number;
}): Promise<MessageAnalyticsBucket[]> {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const lookback = lookbackDays[period];

  const rows = await sql`
    WITH scoped_messages AS (
      SELECT
        date_trunc(${period}, m.created_at)::date AS period_start,
        m.sender,
        COALESCE(NULLIF(m.enquiry_category, ''), 'Unclassified') AS category
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
    )
    SELECT
      period_start::text AS period,
      category,
      COUNT(*)::int AS count
    FROM scoped_messages
    WHERE (${sender} = 'all' OR sender = ${sender})
      AND (${category} = 'all' OR category = ${category})
    GROUP BY period_start, category
    ORDER BY period_start DESC, category
  `;

  const buckets = new Map<string, MessageAnalyticsBucket>();
  for (const row of rows) {
    const periodKey = String(row.period);
    const count = Number(row.count);
    let bucket = buckets.get(periodKey);
    if (!bucket) {
      bucket = { period: periodKey, categories: [], total: 0 };
      buckets.set(periodKey, bucket);
    }
    bucket.categories.push({
      category: String(row.category),
      count,
    });
    bucket.total += count;
  }

  return Array.from(buckets.values());
}
