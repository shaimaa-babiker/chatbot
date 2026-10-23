import ChatbotSessions from '@/components/ui/ChatbotSessions';
import { getReviewableChatbots } from '@/lib/chatData';
import { auth } from '@clerk/nextjs/server';
import { currentUser } from '@clerk/nextjs/server';
import React from 'react'

async function ReviewSessions() {
  const {userId} = await auth()
  if(!userId) return;

const user = await currentUser()
const SortedChatbots = await getReviewableChatbots(
  userId,
  user?.primaryEmailAddress?.emailAddress ?? null,
)

  return (
    <div className="flex-1 justify-center pb-20 w-full max-w-5xl px-4">
      <h1 className="text-2xl md:text-3xl font-semibold mt-4 md:mt-10">Chat Sessions</h1>
      <h2 className='mb-5 text-sm md:text-base'>Review all the chat sessions the chat bots have had with your customers</h2>
    <ChatbotSessions chatbots={SortedChatbots}/>
    </div>
  )
}

export default ReviewSessions