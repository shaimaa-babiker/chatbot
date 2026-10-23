import SessionDashboard from "@/components/ui/SessionDashboard"
import { getSessionDetails } from "@/lib/chatData"
import { canReviewSessionsForChatbot } from "@/lib/adminAccess"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export const dynamic  ='force-dynamic'

async function page(props: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return redirect("/login")

  const { id } = await props.params
  const sessionId = parseInt(id, 10)
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return redirect("/review-sessions")
  }

  let session: Awaited<ReturnType<typeof getSessionDetails>>
  try {
    session = await getSessionDetails(sessionId)
  } catch (error) {
    console.error("[review-sessions] failed to load session", error)
    session = null
  }

  if (!session) {
    return (
      <div className="flex-1 p-4 md:p-10 pb-24 text-gray-900 w-full max-w-5xl">
        <h1 className="text-2xl md:text-3xl font-semibold">Session not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          We couldn&apos;t load this session. It may have been deleted.
        </p>
      </div>
    )
  }

  const chatbotId = session.chatbot.id
  // Tenant guard: owner OR invited admin.
  if (
    !chatbotId ||
    !(await canReviewSessionsForChatbot(userId, chatbotId))
  ) {
    return (
      <div className="flex-1 p-4 md:p-10 pb-24 text-gray-900 w-full max-w-5xl">
        <h1 className="text-2xl md:text-3xl font-semibold">Not authorized</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This session belongs to a different workspace.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 md:p-8 pb-24 text-gray-900 w-full max-w-6xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Session Review</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Started {new Date(session.created_at).toLocaleString()}
        </p>
      </div>

      <SessionDashboard
        session={{
          id: session.id,
          startedAt: session.created_at,
          chatbot: { name: session.chatbot.name },
          guest: session.guest
            ? { name: session.guest.name ?? "", email: session.guest.email ?? "" }
            : null,
        }}
        messages={session.messages}
      />
    </div>
  )
}

export default page
