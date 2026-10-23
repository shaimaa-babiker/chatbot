import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getReviewableChatbots } from "@/lib/chatData";
import {
  getAvailableEnquiryCategories,
  getMessageAnalytics,
  type AnalyticsPeriod,
  type AnalyticsSender,
  type EnquiryCategory,
} from "@/lib/analyticsData";
import ClassifyUnclassifiedMessages from "@/components/ui/ClassifyUnclassifiedMessages";

export const dynamic = "force-dynamic";

const periods: { value: AnalyticsPeriod; label: string }[] = [
  { value: "day", label: "Daily · last 30 days" },
  { value: "month", label: "Monthly · last 12 months" },
  { value: "year", label: "Yearly · last 5 years" },
];

function formatPeriod(period: string, granularity: AnalyticsPeriod): string {
  const date = new Date(`${period}T12:00:00Z`);
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
    chatbotId?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const params = await props.searchParams;
  const period: AnalyticsPeriod =
    params.period === "month" || params.period === "year"
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
  const categories = selectedChatbot
    ? await getAvailableEnquiryCategories({
        userId,
        email,
        chatbotId: selectedChatbot.id,
      })
    : [];
  const category: EnquiryCategory =
    categories.find((option) => option === params.category) ?? "all";

  const buckets = selectedChatbot
    ? await getMessageAnalytics({
        userId,
        email,
        period,
        sender,
        category,
        chatbotId: selectedChatbot.id,
      })
    : [];
  const totalMessages = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.total));

  return (
    <main className="w-full max-w-5xl p-4 md:p-8 text-gray-900">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
          {user?.fullName ? `${user.fullName} · ` : ""}Chatbot analytics
        </p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View message totals and enquiry categories for one chatbot at a time.
        </p>
      </header>

      <section className="mb-5 rounded-2xl border bg-white p-4 md:p-5">
        <form
          action="/analytics"
          method="get"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
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
            Enquiry
            <select
              name="category"
              defaultValue={category}
              className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
            >
              <option value="all">All enquiries</option>
              {categories.map((option) => (
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
        {selectedChatbot && (
          <ClassifyUnclassifiedMessages chatbotId={selectedChatbot.id} />
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <h2 className="text-lg font-semibold">Message totals by period</h2>
        {buckets.length === 0 ? (
          <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-muted-foreground">
            No messages match these filters in the selected time range.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {buckets.map((bucket) => (
              <article key={bucket.period} className="border-b pb-4 last:border-0">
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <h3 className="font-medium">
                    {formatPeriod(bucket.period, period)}
                  </h3>
                  <span className="font-semibold tabular-nums">
                    {bucket.total} {bucket.total === 1 ? "message" : "messages"}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-gray-100"
                  role="img"
                  aria-label={`${bucket.total} messages`}
                >
                  <div
                    className="h-full rounded-full bg-[#2991EE]"
                    style={{ width: `${(bucket.total / peak) * 100}%` }}
                  />
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {bucket.categories.map((item) => (
                    <li key={item.category}>
                      {item.category}: {item.count}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
