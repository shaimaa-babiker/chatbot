 'use client'

import { Button } from "@/components/ui/button"
import Avatar from "../../../components/ui/Avatar"
import { Input } from "@/components/ui/input"
import { useUser } from "@clerk/nextjs"
import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"

function CreateChatbot() {
  const {user}=useUser();
  const [name,setName]=useState('');
  const [error,setError]=useState<string | null>(null);

  const router=useRouter();

  const [loading, setLoading] = useState(false)

  const handleSubmit= async (e:FormEvent) => {
    e.preventDefault();
setError(null);
try {
  setLoading(true)
  const response = await fetch("/api/chatbots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? "Failed to create chatbot")
  setName('');
  router.push(`/edit-chatbot/${result.id}`)
  
} catch (err) {
  console.error(err)
  setError(err instanceof Error ? err.message : "Failed to create chatbot")
} finally {
  setLoading(false)
}
  }

if(!user) return null;

  return (
    <div className="flex flex-col items-center justify-center md:flex-row md:space-x-10 bg-white p-5 md:p-10 rounded-md m-3 md:m-10 w-full max-w-4xl">
      <Avatar seed="create-chatbot" />
      <div className="flex-1 w-full">
         <h1 className="text-xl lg:text-3xl font-semibold mt-3 md:mt-0">Create</h1>
        <h2 className="font-light text-sm md:text-base">Create a new chatbot assist you in your conversation with your customers</h2>
      <form className="flex flex-col md:flex-row gap-3 md:gap-5 mt-5" onSubmit={handleSubmit}>
        <Input
          placeholder="Chatbot Name..."
          type="text"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          required
          className="w-full md:max-w-lg"
        />
        <Button disabled ={loading || !name}>{loading?'Loading...':'Create Chatbot'}</Button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <p className="mt-5 text-gray-300"></p>
      </div>
    </div>
  )
}

export default CreateChatbot