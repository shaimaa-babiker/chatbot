'use client'

import { Chatbot } from '@/types/types'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion"
  
import React, { useEffect, useMemo, useState } from 'react'
import Avatar from './Avatar'
import Link from 'next/link'
import ReactTimeago from 'react-timeago'

function ChatbotSessions({chatbots} :{chatbots:Chatbot[]}) {
    const [sortedChatbots,setSortedChatbots]=React.useState<Chatbot[]>(chatbots)
    const [categoryFilter, setCategoryFilter] = useState('')
    const [tagFilter, setTagFilter] = useState('')
    
    useEffect(()=>{
        const sortedArray=[...chatbots].sort((a,b)=>
            b.chat_sessions.length - a.chat_sessions.length
        )
        setSortedChatbots(sortedArray)
    },[chatbots])

    const tagOptions = useMemo(
        () => [...new Set(chatbots.flatMap(chatbot =>
            chatbot.chat_sessions.flatMap(session => session.tags ?? [])
        ))].sort((a, b) => a.localeCompare(b)),
        [chatbots],
    )
    const matchingSessionCount = sortedChatbots.reduce((total, chatbot) =>
        total + chatbot.chat_sessions.filter(session =>
            (!categoryFilter || session.categories?.some(category => category === categoryFilter)) &&
            (!tagFilter || session.tags?.includes(tagFilter))
        ).length, 0)

  return (
    <div className='bg-white'>
        <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
                Category
                <select
                    value={categoryFilter}
                    onChange={event => setCategoryFilter(event.target.value)}
                    className="h-10 rounded-md border border-gray-300 bg-white px-3 font-normal"
                >
                    <option value="">All categories</option>
                    <option value="product">Product</option>
                    <option value="service">Service</option>
                    <option value="opportunity">Opportunity</option>
                </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
                Tag
                <select
                    value={tagFilter}
                    onChange={event => setTagFilter(event.target.value)}
                    className="h-10 rounded-md border border-gray-300 bg-white px-3 font-normal"
                >
                    <option value="">All tags</option>
                    {tagOptions.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
            </label>
        </div>
        {matchingSessionCount === 0 && (categoryFilter || tagFilter) && (
            <p className="mb-4 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                No sessions match these category and tag filters.
            </p>
        )}
        <Accordion type='single' collapsible>
{sortedChatbots.map((chatbot) => {
    const sessions = chatbot.chat_sessions.filter(session =>
        (!categoryFilter || session.categories?.some(category => category === categoryFilter)) &&
        (!tagFilter || session.tags?.includes(tagFilter))
    )
    if ((categoryFilter || tagFilter) && sessions.length === 0) return null
    const hasSessions = sessions.length > 0
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
                    {sessions.length} Sessions
                </p>
            </div>
            </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 md:space-y-5 p-3 md:p-5 bg-gray-100 rounded-md">
                {sessions.map((session)=>(
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
                    {((session.categories?.length ?? 0) > 0 || (session.tags?.length ?? 0) > 0) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {(session.categories ?? []).map(category => (
                                <span key={category} className="rounded-full bg-white/20 px-2 py-1 text-xs capitalize">
                                    {category}
                                </span>
                            ))}
                            {(session.tags ?? []).map(tag => (
                                <span key={tag} className="rounded-full bg-white/30 px-2 py-1 text-xs">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
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