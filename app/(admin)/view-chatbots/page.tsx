import Avatar from "@/components/ui/Avatar"
import { Button } from "@/components/ui/button"

import { getOwnedChatbots } from "@/lib/chatData"
import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { isOwnerOfAnyChatbot } from "@/lib/adminAccess"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

async function ViewChatbots () {
    const  {userId} = await auth()
if(!userId) return;
if (!(await isOwnerOfAnyChatbot(userId))) redirect("/review-sessions");


const userChatbots = await getOwnedChatbots(userId)


  return (
    <div className="w-full h-full justify-center items-center flex flex-col px-2 py-4 md:py-10">
        <h1 className="text-2xl md:text-3xl font-semibold mb-3 md:mb-5">Active Chatbots</h1>
        {userChatbots.length === 0  && (
            <div className="text-center max-w-md">
                <p>You have not created any chatbots yet, Click on the button below to create one</p>
                <Link href="/create-chatbot" className="cursor-pointer inline-block">
                <Button  className='bg-[#64B5F5] text-white p-3 rounded-md mt-5 cursor-pointer'>Create Chatbot</Button>
                </Link>
            </div>
        )}

        <ul className="flex flex-col space-y-4 md:space-y-5 w-full">
            {userChatbots.map((chatbot) => (
               <Link key={chatbot.id} href={`/edit-chatbot/${chatbot.id}`}>
                <li className="relative p-5 md:p-10 border rounded-md max-w-3xl bg-white">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 pr-16">
                        <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
                            <Avatar seed={chatbot.name} />
                            <h2 className="text-lg md:text-xl font-bold truncate">{chatbot.name}</h2>
                        </div>
                            <p className="absolute top-3 right-3 md:top-5 md:right-5 text-[10px] md:text-xs text-gray-400">
                                Created:{new Date(chatbot.created_at).toLocaleDateString()}
                            </p>
                    </div>
                    <hr className="mt-2 my-3 md:my-4"/>
                    <div className="grid grid-cols-1 gap-3 md:gap-5">
                        <h3 className="italic font-semibold"> Characteristics:  </h3>
                        <ul className="text-xs space-y-1">
                            {!chatbot.chatbot_characteristics.length && (
                                <li className="text-sm">No characteristics added yet</li>
                            )}
                            {chatbot.chatbot_characteristics.map((characteristic) => (
                                <li key={characteristic.id} className=" list-disc break-words" >{characteristic.content}</li>
                            ))}
                        </ul>
                        <h3 className="italic font-semibold"> Number of Sessions: </h3>
                       <p>{chatbot.chat_sessions?.length} </p>
                    </div>
                </li>
               </Link>
            ))}
        </ul>
    </div>

  )
}

export default ViewChatbots