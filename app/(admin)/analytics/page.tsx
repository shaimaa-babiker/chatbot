import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getReviewableChatbots } from "@/lib/chatData";
import {
  getAvailableTags,
  getFilteredMessages,
  getMessageAnalytics,
  leadCategories,
  type AnalyticsPeriod,
  type AnalyticsSender,
  type LeadCategory,
} from "@/lib/analyticsData";

export const dynamic = "force-dynamic";

const periods: { value: AnalyticsPeriod; label: string }[] = [
  { value: "day", label: "Day · last 24 hours" },
  { value: "week", label: "Week · last 7 days" },
  { value: "month", label: "Month · last 30 days" },
  { value: "year", label: "Year · last 365 days" },
];

function formatPeriod(period: string, granularity: AnalyticsPeriod): string {
  const date = new Date(`${period}T12:00:00Z`);
  if (granularity === "week") {
    return `Week of ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date)}`;
  }
  if (granularity === "year") {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  if (granularity === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export default async function AnalyticsPage(props: {
  searchParams: Promise<{
    period?: string;
    sender?: string;
    category?: string;
    tag?: string;
    chatbotId?: string;
    page?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const params = await props.searchParams;
  const period: AnalyticsPeriod =
    params.period === "week" ||
    params.period === "month" ||
    params.period === "year"
      ? params.period
      : "day";
  const sender: AnalyticsSender =
    params.sender === "user" || params.sender === "ai"
      ? params.sender
      : "all";
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const chatbots = await getReviewableChatbots(userId, email);
  const requestedChatbotId = Number(params.chatbotId);
  const selectedChatbot =
    chatbots.find((chatbot) => chatbot.id === requestedChatbotId) ??
    chatbots[0] ??
    null;
  const tags = selectedChatbot
    ? await getAvailableTags({
        userId,
        email,
        chatbotId: selectedChatbot.id,
      })
    : [];
  const category: LeadCategory | "all" =
    leadCategories.find((option) => option.value === params.category)?.value ??
    "all";
  const tag = tags.includes(params.tag ?? "") ? params.tag! : "all";
  const requestedPage = Number(params.page);
  const messagePage =
    Number.isInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 1_000_000
      ? requestedPage
      : 1;

  const buckets = selectedChatbot
    ? await getMessageAnalytics({
        userId,
        email,
        period,
        sender,
        category,
        tag,
        chatbotId: selectedChatbot.id,
      })
    : [];
  const filteredMessages = selectedChatbot
    ? await getFilteredMessages({
        userId,
        email,
        period,
        sender,
        category,
        tag,
        chatbotId: selectedChatbot.id,
        page: messagePage,
      })
    : { messages: [], page: 1, hasMore: false };
  const totalMessages = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const chartBuckets = [...buckets].reverse();
  const chartSeries = [
    { value: "product", label: "Product", color: "#078F91" },
    { value: "service", label: "Service", color: "#064B7A" },
    { value: "opportunity", label: "Opportunity", color: "#78D34F" },
  ] as const;
  const chartWidth = Math.max(680, chartBuckets.length * 28 + 96);
  const chartTop = 28;
  const chartBottom = 215;
  const chartLeft = 56;
  const chartRight = chartWidth - 24;
  const groupWidth =
    chartBuckets.length > 0
      ? (chartRight - chartLeft) / chartBuckets.length
      : 0;
  const chartPeak = Math.max(
    1,
    ...chartBuckets.flatMap((bucket) =>
      chartSeries.map(
        ({ value }) =>
          bucket.categories.find((item) => item.category === value)?.count ?? 0,
      ),
    ),
  );
  const chartMax = Math.max(4, Math.ceil(chartPeak / 4) * 4);
  const barWidth = Math.min(18, groupWidth * 0.19);
  const chartLabelIndexes = new Set(
    chartBuckets
      .map((_, index) => index)
      .filter(
        (index) =>
          chartBuckets.length <= 7 ||
          index === 0 ||
          index === chartBuckets.length - 1 ||
          index % Math.ceil(chartBuckets.length / 6) === 0,
      ),
  );
  const senderCounts = filteredMessages.messages.reduce(
    (counts, message) => {
      counts[message.sender] += 1;
      return counts;
    },
    { user: 0, ai: 0 },
  );
  const visibleMessageCount =
    senderCounts.user + senderCounts.ai;
  const senderPie =
    visibleMessageCount > 0
      ? `conic-gradient(#2991EE 0% ${
          (senderCounts.user / visibleMessageCount) * 100
        }%, #8B5CF6 ${
          (senderCounts.user / visibleMessageCount) * 100
        }% 100%)`
      : "conic-gradient(#e5e7eb 0% 100%)";
  const stopWords = new Set([
    "about", "after", "again", "also", "and", "are", "because", "been",
    "before", "being", "but", "can", "could", "did", "does", "for", "from",
    "had", "has", "have", "her", "here", "him", "his", "how", "into", "its",
    "just", "more", "most", "not", "our", "out", "please", "should", "some",
    "that", "the", "their", "them", "then", "there", "these", "they", "this",
    "those", "through", "was", "were", "what", "when", "where", "which",
    "who", "will", "with", "would", "you", "your",
  ]);
  const wordCounts = new Map<string, number>();
  for (const message of filteredMessages.messages) {
    for (const word of message.content.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []) {
      if (word.length < 3 || stopWords.has(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }
  const cloudWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);
  const maxWordCount = Math.max(1, ...cloudWords.map(([, count]) => count));
  const messagePageUrl = (page: number) => {
    const query = new URLSearchParams({
      chatbotId: String(selectedChatbot?.id ?? ""),
      period,
      sender,
      category,
      tag,
      page: String(page),
    });
    return `/analytics?${query.toString()}`;
  };

  return (
    <main className="w-full max-w-5xl p-4 md:p-8 text-gray-900">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
          {user?.fullName ? `${user.fullName} · ` : ""}Chatbot analytics
        </p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View customer-message tags and Product, Service, or Opportunity totals.
        </p>
      </header>

      <section className="mb-5 rounded-2xl border bg-white p-4 md:p-5">
        <form
          action="/analytics"
          method="get"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] xl:items-end"
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Chatbot
            <select
              name="chatbotId"
              defaultValue={selectedChatbot?.id ?? ""}
              disabled={chatbots.length === 0}
              className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
            >
              {chatbots.length === 0 ? (
                <option value="">No chatbots available</option>
              ) : (
                chatbots.map((chatbot) => (
                  <option key={chatbot.id} value={chatbot.id}>
                    {chatbot.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Time period
            <select
              name="period"
              defaultValue={period}
              className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
            >
              {periods.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Message sender
            <select
              name="sender"
              defaultValue={sender}
              className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
            >
              <option value="all">All senders</option>
              <option value="user">Customer</option>
              <option value="ai">AI</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Category
            <select
              name="category"
              defaultValue={category}
              className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
            >
              <option value="all">All categories</option>
              {leadCategories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Tag
            <select
              name="tag"
              defaultValue={tag}
              className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
            >
              <option value="all">All tags</option>
              {tags.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-10 rounded-lg bg-[#3b3b3b] px-5 text-sm font-medium text-white hover:bg-black"
          >
            Apply filters
          </button>
        </form>
      </section>

      <section className="mb-5 rounded-2xl border bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {selectedChatbot?.name ?? "No chatbot selected"} · Total messages ·{" "}
          {periods.find((option) => option.value === period)?.label}
        </p>
        <p className="mt-2 text-3xl font-semibold">{totalMessages}</p>
      </section>

      <section className="mb-5 grid gap-5">
        <article className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Messages by category</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare Product, Service, and Opportunity messages by period.
              </p>
            </div>
          </div>
          {chartBuckets.length === 0 ? (
            <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-muted-foreground">
              No messages match these filters in the selected time range.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} 270`}
                width={chartWidth}
                height="270"
                className="block max-w-none"
                role="img"
                aria-label="Grouped bar chart comparing message categories over time"
              >
                {[0, 1, 2, 3, 4].map((tick) => {
                  const value = (chartMax / 4) * (4 - tick);
                  const y =
                    chartTop + (tick / 4) * (chartBottom - chartTop);
                  return (
                    <g key={tick}>
                      <line
                        x1={chartLeft}
                        x2={chartRight}
                        y1={y}
                        y2={y}
                        stroke={tick === 4 ? "#9ca3af" : "#e5e7eb"}
                      />
                      <text
                        x={chartLeft - 12}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-gray-700 text-[12px]"
                      >
                        {Math.round(value)}
                      </text>
                    </g>
                  );
                })}
                {chartBuckets.map((bucket, bucketIndex) => {
                  const groupCenter =
                    chartLeft + groupWidth * (bucketIndex + 0.5);
                  return (
                    <g key={bucket.period}>
                      {chartSeries.map((series, seriesIndex) => {
                        const count =
                          bucket.categories.find(
                            (item) => item.category === series.value,
                          )?.count ?? 0;
                        const height =
                          (count / chartMax) * (chartBottom - chartTop);
                        const x =
                          groupCenter +
                          (seriesIndex - (chartSeries.length - 1) / 2) *
                            (barWidth + 2) -
                          barWidth / 2;
                        const y = chartBottom - height;
                        return (
                          <rect
                            key={series.value}
                            x={x}
                            y={y}
                            width={barWidth}
                            height={Math.max(height, count > 0 ? 1 : 0)}
                            fill={series.color}
                            rx="1"
                          >
                            <title>
                              {formatPeriod(bucket.period, period)} ·{" "}
                              {series.label}: {count}
                            </title>
                          </rect>
                        );
                      })}
                      {chartLabelIndexes.has(bucketIndex) && (
                        <text
                          x={groupCenter}
                          y="240"
                          textAnchor="middle"
                          className="fill-gray-700 text-[11px]"
                        >
                          {formatPeriod(bucket.period, period)}
                        </text>
                      )}
                    </g>
                  );
                })}
                <line
                  x1={chartLeft}
                  x2={chartRight}
                  y1={chartBottom}
                  y2={chartBottom}
                  stroke="#9ca3af"
                />
              </svg>
              <ul
                aria-label="Chart legend"
                className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-700"
              >
                {chartSeries.map((series) => (
                  <li key={series.value} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: series.color }}
                    />
                    {series.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-4 md:p-5">
            <h2 className="text-lg font-semibold">Messages by sender</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Breakdown for the messages shown on this page.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-6">
              <div
                className="h-36 w-36 rounded-full"
                style={{ background: senderPie }}
                role="img"
                aria-label={`Customer: ${senderCounts.user}; AI: ${senderCounts.ai}`}
              />
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#2991EE]" />
                  Customer <strong>{senderCounts.user}</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#8B5CF6]" />
                  AI <strong>{senderCounts.ai}</strong>
                </li>
              </ul>
            </div>
          </article>

          <article className="rounded-2xl border bg-white p-4 md:p-5">
            <h2 className="text-lg font-semibold">Word cloud</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Frequent words in the messages shown on this page.
            </p>
            {cloudWords.length === 0 ? (
              <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-muted-foreground">
                There is not enough message text to build a word cloud.
              </p>
            ) : (
              <div
                className="mt-4 flex min-h-36 flex-wrap content-center items-center justify-center gap-x-4 gap-y-2 rounded-lg bg-gray-50 p-4 text-center"
                aria-label="Word cloud of frequent message terms"
              >
                {cloudWords.map(([word, count], index) => (
                  <span
                    key={word}
                    title={`${count} ${count === 1 ? "occurrence" : "occurrences"}`}
                    className={
                      index % 3 === 0
                        ? "font-semibold text-blue-700"
                        : index % 3 === 1
                          ? "font-medium text-violet-700"
                          : "font-medium text-gray-700"
                    }
                    style={{
                      fontSize: `${14 + Math.round((count / maxWordCount) * 20)}px`,
                    }}
                  >
                    {word}
                  </span>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Filtered messages</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing the message content that matches the filters above.
            </p>
          </div>
          {filteredMessages.messages.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Page {filteredMessages.page}
            </p>
          )}
        </div>

        {filteredMessages.messages.length === 0 ? (
          <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-muted-foreground">
            No messages match these filters in the selected time range.
          </p>
        ) : (
          <>
            <ul className="mt-4 divide-y rounded-lg border">
              {filteredMessages.messages.map((message) => (
                <li key={message.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase text-gray-700">
                      {message.sender === "user" ? "Customer" : "AI"}
                    </span>
                    <span>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(message.createdAt))}
                    </span>
                    <span>
                      {message.guestName || "Anonymous"}
                      {message.guestEmail ? ` · ${message.guestEmail}` : ""}
                    </span>
                    <a
                      href={`/review-sessions/${message.sessionId}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      View conversation
                    </a>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900">
                    {message.content}
                  </p>
                  {(message.categories.length > 0 || message.tags.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.categories.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-700"
                        >
                          {item}
                        </span>
                      ))}
                      {message.tags.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <nav
              aria-label="Filtered message pages"
              className="mt-4 flex justify-between"
            >
              {filteredMessages.page > 1 ? (
                <a
                  href={messagePageUrl(filteredMessages.page - 1)}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Previous
                </a>
              ) : (
                <span />
              )}
              {filteredMessages.hasMore && (
                <a
                  href={messagePageUrl(filteredMessages.page + 1)}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Next
                </a>
              )}
            </nav>
          </>
        )}
      </section>

    </main>
  );
}
