'use client'

import React, { FormEvent, use, useEffect, useRef, useState } from 'react'
import Link from 'next/link' 
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from "sonner"
import Avatar from '@/components/ui/Avatar';
import { ChatbotCharacteristic, ChatbotTag } from '@/types/types';
import Characteristics from '@/components/ui/Characteristics';
import ChatbotTags from '@/components/ui/ChatbotTags';
import { useRouter } from 'next/navigation';
import { DEFAULT_WIDGET_CONFIG, FONT_FAMILIES, type WidgetConfig } from '@/lib/widgetConfig';

type EditableChatbot = {
  id: number;
  name: string;
  created_at: string;
  chatbot_characteristics: ChatbotCharacteristic[];
  widget_config: WidgetConfig;
  tags: ChatbotTag[];
};

function page(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params)
  const { id } = params
  const [url,setUrl]=useState<string>('');
const [chatbotName,setChatbotName]=useState<string>('');
const [newCharacteristic,setNewCharacteristic]=useState<string>('');
const [chatbot, setChatbot] = useState<EditableChatbot | null>(null)
const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({ ...DEFAULT_WIDGET_CONFIG })
const [savingWidgetConfig, setSavingWidgetConfig] = useState(false)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const router = useRouter()

useEffect(()=>{
  let cancelled = false
  fetch(`/api/chatbots/${id}`)
    .then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Failed to load chatbot')
      return result as EditableChatbot
    })
    .then((result: EditableChatbot) => {
      if (cancelled) return
      setChatbot(result)
      setChatbotName(result.name)
      setWidgetConfig(result.widget_config)
    })
    .catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load chatbot')
    })
    .finally(() => {
      if (!cancelled) setLoading(false)
    })
  return () => { cancelled = true }
},[id])

useEffect(()=>{
  setUrl(`${window.location.origin}/chatbot/${id}`)
},[id])

const handleUpdateChatbot = async (e:FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  try {
    const response = await fetch(`/api/chatbots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: chatbotName }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Failed to update chatbot')
    toast.success('Chatbot Name Successfully updated!')
    setChatbot(prev => prev ? { ...prev, name: result.name } : prev)
  } catch (error) {
    console.error("Error updating chatbot:", error);
    toast.error('Failed to update chatbot')
  }
}

const handleSaveWidgetConfig = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  setSavingWidgetConfig(true)
  try {
    const response = await fetch(`/api/chatbots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_config: widgetConfig }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Failed to save chat appearance')
    setWidgetConfig(result.widget_config)
    toast.success('Chat appearance saved')
  } catch (error) {
    console.error('Error saving chat appearance:', error)
    toast.error(error instanceof Error ? error.message : 'Failed to save chat appearance')
  } finally {
    setSavingWidgetConfig(false)
  }
}

const handleDelete = async (id:string) => {
const isConfirmed= window.confirm('Are you sure you want to delete this chatbot?')
if(isConfirmed)
  try {
    const response = await fetch(`/api/chatbots/${id}`, {
      method: 'DELETE',
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Failed to delete chatbot')
    toast.success('Chatbot Successfully deleted!')
    router.push('/view-chatbots')
  } catch (error) {
    console.error("Error deleting chatbot:", error);
    toast.error('Failed to delete chatbot')
  }
}

const handleAddCharacteristic = async (content:string)=>{
  try {
    const response = await fetch(`/api/chatbots/${id}/characteristics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Failed to add information')
    setChatbot(prev => prev
      ? { ...prev, chatbot_characteristics: [...(prev.chatbot_characteristics ?? []), result] }
      : prev)
    toast.success('Information added')
  } catch (error) {
    console.error("Error adding information:", error);
    toast.error('Failed to add information')
  }
  }

if(loading)
  return(
<div className="mx-auto animate-spin p-10">
  <Avatar seed='papafam support Agent'/>
</div>)

if(error) return <p>Error: {error}</p>

if(!chatbot) {
  router.push('/view-chatbots')
  return null
}


  return (
    <div className='w-full max-w-5xl px-3 md:px-0'>
  <div className='z-40 mb-5 rounded-lg border border-white/20 bg-[#2991EE] p-4 shadow-lg md:ml-auto md:max-w-sm md:p-5'>
    <h2 className="text-white text-sm font-bold">Link to Chat</h2>
    <p className="text-xs italic text-white md:text-sm">Share this link with your customers to start a conversation with your chatbot</p>
    <div className='mt-2 flex flex-col space-y-2 md:flex-row md:items-center md:space-x-2 md:space-y-0'>
      <Link href={url} className='w-full cursor-pointer hover:opacity-50'>
        <Input value={url} className='cursor-pointer bg-white text-black' readOnly />
      </Link>
      <Button
        size='sm'
        className='cursor-pointer self-start px-3 md:self-auto'
        onClick={() => {
          navigator.clipboard.writeText(url)
          toast.success("Copied to clipboard")
        }}
      >
        <span className='sr-only'>Copy</span>
        <Copy className='h-4 w-4' />
      </Button>
    </div>
    <Button
      variant='destructive'
      className='mt-4 w-full'
      onClick={() => handleDelete(id)}
    >
      Delete chatbot
    </Button>
  </div>
  <section className='relative p-4 md:p-10 rounded-lg'>
    <div className='flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0 pr-20'>
      <Avatar seed={chatbotName}/>
      <form className='flex flex-col sm:flex-row sm:flex-1 sm:space-x-2 space-y-2 sm:space-y-0 sm:items-center'
      onSubmit={handleUpdateChatbot}
      >
        <Input
        value={chatbotName}
        onChange={(e)=>setChatbotName(e.target.value)}
        placeholder={chatbotName}
  required
  className='w-full sm:w-1/2 border-gray-400 bg-transparent text-lg md:text-xl font-bold text-black'
  />
        <Button type='submit' className='cursor-pointer self-start sm:self-auto' disabled={!chatbotName}>Update</Button>
      </form>
    </div>
    <h2 className="text-lg md:text-xl font-bold mt-8 md:mt-10 mb-1">Heres what your AI knows...</h2>
    <p className='text-sm md:text-base'>Your chatbot is equipped with the following information to assist you in your conversations with your customers & users</p>

    <div className='bg-card/40 backdrop-blur-lg border border-border shadow-xl p-4 md:p-10 rounded-md mt-5 md:mt-8'>
      <form onSubmit={e=>{
        e.preventDefault();
        handleAddCharacteristic(newCharacteristic)
        setNewCharacteristic("")
      }}
      className='flex flex-col md:flex-row mb-5 space-y-2 md:space-y-0 md:space-x-2 md:items-center'
      >
        <NewCharacteristicField
          value={newCharacteristic}
          onChange={setNewCharacteristic}
        />
        <Button type='submit' className='cursor-pointer self-start md:self-auto' disabled={!newCharacteristic}>Add</Button>
        </form>
        {chatbot.chatbot_characteristics?.length ? (
          <div className='overflow-hidden rounded-md border border-gray-200 bg-white'>
            <div className='flex items-center justify-between border-b border-gray-200 bg-gray-50/70 px-4 py-2'>
              <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
                Saved characteristics
              </h3>
              <span className='text-xs text-gray-500'>
                {chatbot.chatbot_characteristics.length} total
              </span>
            </div>
            <ul className='divide-y divide-gray-200'>
              {chatbot.chatbot_characteristics.map((characteristic, idx) => (
                <Characteristics
                  key={characteristic.id}
                  characteristics={characteristic}
                  index={idx + 1}
                />
              ))}
            </ul>
          </div>
        ) : (
          <p className='rounded-md border border-dashed border-gray-300 bg-white/50 px-4 py-6 text-center text-sm text-gray-500'>
            No characteristics yet. Add one above to teach your chatbot how to respond.
          </p>
        )}
    </div>
    <ChatbotTags chatbotId={chatbot.id} initialTags={chatbot.tags ?? []} />
    <section className='mt-8 rounded-xl border border-gray-200 bg-white p-4 md:p-6'>
      <div className='mb-5'>
        <h2 className='text-lg font-bold'>Chat appearance</h2>
        <p className='mt-1 text-sm text-gray-600'>Customize the no-iframe website widget. Changes are saved to the embed package automatically.</p>
      </div>
      <form onSubmit={handleSaveWidgetConfig} className='grid gap-6 lg:grid-cols-[1fr_300px]'>
        <div className='grid content-start gap-4 sm:grid-cols-2'>
          <label className='grid gap-1 text-sm font-medium'>
            Header title
            <Input maxLength={80} value={widgetConfig.headerTitle} placeholder={chatbotName || 'Assistant'} onChange={e => setWidgetConfig(prev => ({ ...prev, headerTitle: e.target.value }))} />
          </label>
          <label className='grid gap-1 text-sm font-medium'>
            Header subtitle
            <Input maxLength={120} value={widgetConfig.subtitle} onChange={e => setWidgetConfig(prev => ({ ...prev, subtitle: e.target.value }))} />
          </label>
          <label className='grid gap-1 text-sm font-medium sm:col-span-2'>
            Logo URL
            <Input type='url' maxLength={2048} value={widgetConfig.logoUrl} placeholder='https://example.com/logo.png' onChange={e => setWidgetConfig(prev => ({ ...prev, logoUrl: e.target.value }))} />
          </label>
          <ColorSetting label='Primary / send button' value={widgetConfig.primaryColor} onChange={value => setWidgetConfig(prev => ({ ...prev, primaryColor: value }))} />
          <ColorSetting label='Panel background' value={widgetConfig.panelBackground} onChange={value => setWidgetConfig(prev => ({ ...prev, panelBackground: value }))} />
          <ColorSetting label='Text color' value={widgetConfig.textColor} onChange={value => setWidgetConfig(prev => ({ ...prev, textColor: value }))} />
          <ColorSetting label='Visitor message color' value={widgetConfig.userBubbleColor} onChange={value => setWidgetConfig(prev => ({ ...prev, userBubbleColor: value }))} />
          <ColorSetting label='Visitor message text' value={widgetConfig.userBubbleTextColor} onChange={value => setWidgetConfig(prev => ({ ...prev, userBubbleTextColor: value }))} />
          <label className='grid gap-1 text-sm font-medium'>
            Font
            <select className='h-10 rounded-md border border-gray-300 bg-white px-3 text-sm' value={widgetConfig.fontFamily} onChange={e => setWidgetConfig(prev => ({ ...prev, fontFamily: e.target.value as WidgetConfig['fontFamily'] }))}>
              {FONT_FAMILIES.map(font => <option key={font} value={font}>{font.split(',')[0].replaceAll("'", '')}</option>)}
            </select>
          </label>
          <label className='grid gap-1 text-sm font-medium'>
            Corner roundness ({widgetConfig.borderRadius}px)
            <input type='range' min={0} max={32} value={widgetConfig.borderRadius} onChange={e => setWidgetConfig(prev => ({ ...prev, borderRadius: Number(e.target.value) }))} />
          </label>
          <label className='grid gap-1 text-sm font-medium'>
            Message placeholder
            <Input maxLength={80} value={widgetConfig.inputPlaceholder} onChange={e => setWidgetConfig(prev => ({ ...prev, inputPlaceholder: e.target.value }))} />
          </label>
          <label className='grid gap-1 text-sm font-medium'>
            Send button label
            <Input maxLength={24} value={widgetConfig.sendButtonLabel} onChange={e => setWidgetConfig(prev => ({ ...prev, sendButtonLabel: e.target.value }))} />
          </label>
          <div className='flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2'>
            <label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={widgetConfig.showSecureBadge} onChange={e => setWidgetConfig(prev => ({ ...prev, showSecureBadge: e.target.checked }))} />Show secure badge</label>
            <label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={widgetConfig.showPoweredBy} onChange={e => setWidgetConfig(prev => ({ ...prev, showPoweredBy: e.target.checked }))} />Show Powered by</label>
          </div>
          <div className='sm:col-span-2'>
            <Button type='submit' disabled={savingWidgetConfig}>{savingWidgetConfig ? 'Saving…' : 'Save appearance'}</Button>
          </div>
        </div>
        <div>
          <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500'>Live preview</p>
          <div className='overflow-hidden border border-gray-200 shadow-sm' style={{ borderRadius: widgetConfig.borderRadius, backgroundColor: widgetConfig.panelBackground, color: widgetConfig.textColor, fontFamily: widgetConfig.fontFamily }}>
            <div className='flex items-center gap-3 border-b border-black/10 p-3'>
              {widgetConfig.logoUrl ? <img src={widgetConfig.logoUrl} alt='' className='h-9 w-9 rounded-full object-cover' /> : <span className='grid h-9 w-9 place-items-center rounded-full bg-black/5 font-semibold'>{(widgetConfig.headerTitle || chatbotName || 'A').charAt(0)}</span>}
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-semibold'>{widgetConfig.headerTitle || chatbotName || 'Assistant'}</p>
                <p className='truncate text-xs opacity-70'>{widgetConfig.subtitle}</p>
              </div>
              {widgetConfig.showSecureBadge && <span className='rounded-full border border-black/10 px-2 py-1 text-[10px]'>Secure</span>}
            </div>
            <div className='space-y-3 p-4 text-xs'>
              <p className='max-w-[85%] rounded-xl border border-black/10 bg-white/80 p-3'>Hello! How can I help you today?</p>
              <p className='ml-auto w-fit max-w-[85%] p-3' style={{ borderRadius: widgetConfig.borderRadius, backgroundColor: widgetConfig.userBubbleColor, color: widgetConfig.userBubbleTextColor }}>I have a question</p>
            </div>
            <div className='flex gap-2 border-t border-black/10 p-3'>
              <span className='flex-1 truncate rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-xs opacity-60'>{widgetConfig.inputPlaceholder}</span>
              <span className='rounded-lg px-3 py-2 text-xs font-semibold text-white' style={{ backgroundColor: widgetConfig.primaryColor }}>{widgetConfig.sendButtonLabel}</span>
            </div>
          </div>
        </div>
      </form>
    </section>
  </section>
    </div>
  )
}

export default page

function ColorSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className='flex items-center justify-between gap-3 text-sm font-medium'>
      {label}
      <span className='flex items-center gap-2'>
        <input type='color' value={value} onChange={e => onChange(e.target.value)} className='h-9 w-10 cursor-pointer rounded border border-gray-300 bg-white p-1' />
        <span className='w-[4.5rem] font-mono text-xs text-gray-500'>{value}</span>
      </span>
    </label>
  )
}

function NewCharacteristicField({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder='Example: if your customer ask for price, provide pricing page: www.example.com/pricing'
      rows={1}
      className='w-full flex-1 resize-none overflow-hidden border border-gray-300 bg-transparent px-3 py-2 text-base md:text-xl font-bold text-black/90 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
    />
  )
}