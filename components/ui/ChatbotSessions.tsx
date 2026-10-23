'use client'

import { Chatbot } from '@/types/types'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion"
  
import React, { useEffect } from 'react'
import Avatar from './Avatar'
import Link from 'next/link'
import ReactTimeago from 'react-timeago'

function ChatbotSessions({chatbots} :{chatbots:Chatbot[]}) {
    const [sortedChatbots,setSortedChatbots]=React.useState<Chatbot[]>(chatbots)
    
    useEffect(()=>{
        const sortedArray=[...chatbots].sort((a,b)=>
            b.chat_sessions.length - a.chat_sessions.length
        )
        setSortedChatbots(sortedArray)
    },[chatbots])

  return (
    <div className='bg-white'>
        <Accordion type='single' collapsible>
         

{sortedChatbots.map((chatbot) => {
    const hasSessions = chatbot.chat_sessions.length > 0
    return (
        <AccordionItem key={chatbot.id} value={`item-${chatbot.id}`} className='px-3 md:px-10 py-3 md:py-5'>
{hasSessions ? (
    <>
           <AccordionTrigger>
            <div className="flex text-left item-center w-full">
            <Avatar seed={chatbot.name} className='h-10 w-10 mr-3 md:mr-4 shrink-0'/>
            <div className="flex-1 flex flex-col sm:flex-row sm:justify-between sm:space-x-4 items-start sm:items-center cursor-pointer min-w-0">
                <p className="truncate">{chatbot.name}</p>
                <p className="pr-0 sm:pr-4 font-bold sm:text-right whitespace-nowrap">
                    {chatbot.chat_sessions.length} Sessions
                </p>
            </div>
            </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 md:space-y-5 p-3 md:p-5 bg-gray-100 rounded-md">
                {chatbot.chat_sessions.map((session)=>(
                    <Link
                    href={`/review-sessions/${session.id}`}
                    key={session.id}
                    className='relative p-5 md:p-10 bg-[#2991EE] rounded-md text-white block'
                    >
                    <p className="text-base md:text-lg font-bold pr-16">
                        {session.guests?.name || 'Anonymous'}
                    </p>
                    <p className="text-xs md:text-sm font-light break-all">
                        {session.guests?.email || 'No email provided'}
                    </p>
                    <p className="top-3 right-3 md:top-5 md:right-5 text-xs md:text-sm absolute">
                        <ReactTimeago date={new Date(session.created_at)} />
                    </p>
                    </Link>
                ))}
            
                </AccordionContent>
    </>
            ):(
                <p className="font-light">{chatbot.name} No Sessions</p>
            )}
        </AccordionItem>
    );}      

)}
        </Accordion>
    </div>
  )
}

export default ChatbotSessions