'use client'

import { ChatbotCharacteristic } from '@/types/types'
import { CircleX, Pencil, Check, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'


type Props = {
  characteristics: ChatbotCharacteristic
  index: number
}

export default function Characteristics({ characteristics, index }: Props) {

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(characteristics.content)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!isEditing) return
    const el = draftRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft, isEditing])

  const [saving, setSaving] = useState(false)

  const handleDeleteCharacteristic = async () => {
    try {
      const response = await fetch(`/api/characteristics/${characteristics.id}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Failed to remove characteristic')
      toast.success('Characteristic removed')
      window.location.reload()
    } catch (error) {
      console.error(error)
      toast.error('Failed to remove characteristic')
    }
  }

  const handleStartEdit = () => {
    setDraft(characteristics.content)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setDraft(characteristics.content)
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error('Characteristic cannot be empty')
      return
    }
    if (trimmed === characteristics.content.trim()) {
      setIsEditing(false)
      return
    }
    try {
      setSaving(true)
      const response = await fetch(`/api/characteristics/${characteristics.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Failed to update characteristic')
      toast.success('Characteristic updated')
      setIsEditing(false)
      window.location.reload()
    } catch (error) {
      console.error(error)
      toast.error('Failed to update characteristic')
    } finally {
      setSaving(false)
    }
  }

  const createdLabel = (() => {
    const d = new Date(characteristics.created_at)
    if (Number.isNaN(d.getTime())) return characteristics.created_at
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  })()

  return (
    <li
      key={characteristics.id}
      className='group flex items-start gap-3 border-b border-gray-200 px-3 py-3 last:border-b-0 hover:bg-gray-50/60 transition-colors'
    >
      <span className='mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600'>
        {index}
      </span>

      <div className='min-w-0 flex-1'>
        {isEditing ? (
          <div className='flex flex-col gap-2'>
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder='Characteristic content…'
              className='w-full resize-none overflow-hidden border border-gray-300 bg-white px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50'
              disabled={saving}
              autoFocus
            />
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={handleSaveEdit}
                disabled={saving}
                className='inline-flex items-center gap-1 rounded-md bg-[#2991EE] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50 cursor-pointer'
              >
                <Check className='w-3 h-3' />
                Save
              </button>
              <button
                type='button'
                onClick={handleCancelEdit}
                disabled={saving}
                className='inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer'
              >
                <X className='w-3 h-3' />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className='text-sm text-gray-800 break-words whitespace-pre-wrap leading-relaxed'>
            {characteristics.content}
          </p>
        )}
        <p className='mt-1 text-[11px] text-gray-400'>
          Added {createdLabel}
        </p>
      </div>

      <div className='flex shrink-0 items-center gap-1'>
        {!isEditing && (
          <button
            type='button'
            aria-label='Edit characteristic'
            onClick={handleStartEdit}
            className='inline-flex h-7 w-7 items-center justify-center rounded-md text-blue-500 hover:bg-blue-50 cursor-pointer'
          >
            <Pencil className='h-4 w-4' />
          </button>
        )}
        <button
          type='button'
          aria-label='Delete characteristic'
          onClick={handleDeleteCharacteristic}
          className='inline-flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50 cursor-pointer'
        >
          <CircleX className='h-4 w-4' />
        </button>
      </div>
    </li>
  )
}
