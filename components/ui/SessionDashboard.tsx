'use client'

import { useMemo, useState } from 'react'
import { Message } from '@/types/types'
import Avatar from './Avatar'
import {
  ArrowDownToLine,
  MessageSquare,
  Clock,
  Mail,
  Sparkles,
  UserCircle,
} from 'lucide-react'

type SessionSummary = {
  id: number
  startedAt: string
  chatbot: { name: string }
  guest: { name: string; email: string } | null
}

type Props = {
  session: SessionSummary
  messages: Message[]
}

type SenderFilter = 'all' | 'ai' | 'user'

const dateFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  accent?: 'default' | 'brass' | 'oxblood' | 'teal'
}) {
  const accentClass =
    accent === 'brass'
      ? 'text-[color:var(--brass)] bg-[color:var(--brass)]/10'
      : accent === 'oxblood'
      ? 'text-[color:var(--oxblood)] bg-[color:var(--oxblood)]/10'
      : accent === 'teal'
      ? 'text-[color:var(--teal)] bg-[color:var(--teal)]/10'
      : 'text-foreground bg-foreground/5'

  return (
    <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-4 md:p-5 flex items-start gap-3 md:gap-4">
      <div
        className={`shrink-0 rounded-xl p-2.5 ${accentClass}`}
        aria-hidden
      >
        <Icon className="h-5 w-5 md:h-6 md:w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] md:text-xs uppercase tracking-widest text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-lg md:text-2xl font-semibold mt-1 truncate">
          {value}
        </p>
        {hint && (
          <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 truncate">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

function formatDuration(ms: number) {
  if (ms < 1000) return '0s'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function SessionDashboard({ session, messages }: Props) {
  const [senderFilter, setSenderFilter] = useState<SenderFilter>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'table' | 'transcript'>('table')

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
  )

  const stats = useMemo(() => {
    const startedAt = new Date(session.startedAt)
    const lastAt = sortedMessages.length
      ? new Date(sortedMessages[sortedMessages.length - 1].created_at)
      : startedAt
    const userCount = sortedMessages.filter((m) => m.sender === 'user').length
    const aiCount = sortedMessages.filter((m) => m.sender === 'ai').length
    const avgLen =
      sortedMessages.length === 0
        ? 0
        : Math.round(
            sortedMessages.reduce((s, m) => s + m.content.length, 0) /
              sortedMessages.length
          )
    return {
      total: sortedMessages.length,
      user: userCount,
      ai: aiCount,
      duration: lastAt.getTime() - startedAt.getTime(),
      avgLen,
      lastAt,
      startedAt,
    }
  }, [sortedMessages, session.startedAt])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortedMessages.filter((m) => {
      if (senderFilter !== 'all' && m.sender !== senderFilter) return false
      if (q && !m.content.toLowerCase().includes(q)) return false
      return true
    })
  }, [sortedMessages, senderFilter, query])

  const guest = session.guest
  const chatbot = session.chatbot

  return (
    <div className="w-full space-y-5 md:space-y-6">
      {/* Header strip */}
      <header className="rounded-2xl border border-border bg-card/50 backdrop-blur p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <Avatar
            seed={chatbot.name}
            className="h-10 w-10 md:h-12 md:w-12 rounded-full border border-border shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] md:text-xs uppercase tracking-widest text-muted-foreground font-medium">
                Chatbot
              </span>
              <span className="text-base md:text-lg font-semibold truncate">
                {chatbot.name}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs md:text-sm text-muted-foreground">
              <UserCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {guest?.name ?? 'Anonymous'}
                {guest?.email && (
                  <span className="opacity-60"> · {guest.email}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/export-session/${session.id}?format=csv`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 md:px-4 py-2 text-xs md:text-sm font-medium hover:bg-accent transition-colors"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Export CSV
          </a>
          <a
            href={`/api/export-session/${session.id}?format=xlsx`}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-3 md:px-4 py-2 text-xs md:text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Export Excel
          </a>
        </div>
      </header>

      {/* Stat cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={MessageSquare}
          label="Messages"
          value={stats.total}
          hint={`${stats.user} user · ${stats.ai} AI`}
        />
        <StatCard
          icon={Clock}
          label="Duration"
          value={formatDuration(stats.duration)}
          hint={`Ended ${timeFmt.format(stats.lastAt)}`}
          accent="teal"
        />
        <StatCard
          icon={Mail}
          label="Guest"
          value={guest?.name ?? 'Anonymous'}
          hint={guest?.email ?? 'No email provided'}
          accent="brass"
        />
        <StatCard
          icon={Sparkles}
          label="Avg length"
          value={`${stats.avgLen} ch`}
          hint={`Started ${dateFmt.format(stats.startedAt)}`}
          accent="oxblood"
        />
      </section>

      {/* Filter + view toggle */}
      <section className="rounded-2xl border border-border bg-card/50 backdrop-blur p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        <div className="flex items-center gap-1 rounded-full bg-foreground/5 p-1 self-start">
          {(['all', 'user', 'ai'] as SenderFilter[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSenderFilter(opt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                senderFilter === opt
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt === 'all' ? 'All' : opt === 'user' ? 'Guest' : 'AI'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-full bg-foreground/5 p-1 self-start">
          {(['table', 'transcript'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setView(opt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${
                view === opt
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </section>

      {/* Table view */}
      {view === 'table' && (
        <section className="rounded-2xl border border-border bg-card/50 backdrop-blur overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] md:text-xs uppercase tracking-widest text-muted-foreground border-b border-border bg-foreground/[0.03]">
                  <th className="px-3 md:px-4 py-3 w-12">#</th>
                  <th className="px-3 md:px-4 py-3 w-32">Time</th>
                  <th className="px-3 md:px-4 py-3 w-20">Sender</th>
                  <th className="px-3 md:px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No messages match these filters.
                    </td>
                  </tr>
                )}
                {filtered.map((m, i) => {
                  const isAi = m.sender === 'ai'
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-border/60 last:border-0 hover:bg-foreground/[0.02] align-top"
                    >
                      <td className="px-3 md:px-4 py-3 text-muted-foreground tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-3 md:px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {dateFmt.format(new Date(m.created_at))}
                      </td>
                      <td className="px-3 md:px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                            isAi
                              ? 'bg-[color:var(--brass)]/15 text-[color:var(--brass)]'
                              : 'bg-[color:var(--teal)]/15 text-[color:var(--teal)]'
                          }`}
                        >
                          {isAi ? 'AI' : 'Guest'}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-3 whitespace-pre-wrap break-words">
                        {m.content}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Transcript view — reuses existing component for visual consistency */}
      {view === 'transcript' && (
        <section className="rounded-2xl border border-border bg-card/50 backdrop-blur p-3 md:p-6">
          <div className="text-xs text-muted-foreground mb-3">
            Showing {filtered.length} of {sortedMessages.length} messages
          </div>
          <div className="space-y-3">
            {filtered.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${
                  m.sender === 'user' ? 'flex-row-reverse text-right' : ''
                }`}
              >
                <div
                  className={`shrink-0 h-8 w-8 rounded-full grid place-items-center text-[10px] font-bold uppercase tracking-widest ${
                    m.sender === 'ai'
                      ? 'bg-[color:var(--brass)]/15 text-[color:var(--brass)]'
                      : 'bg-[color:var(--teal)]/15 text-[color:var(--teal)]'
                  }`}
                >
                  {m.sender === 'ai' ? 'AI' : 'G'}
                </div>
                <div
                  className={`rounded-2xl px-3 py-2 max-w-[80%] text-sm whitespace-pre-wrap break-words ${
                    m.sender === 'ai'
                      ? 'bg-foreground/[0.04] text-foreground'
                      : 'bg-[color:var(--teal)]/10 text-foreground'
                  }`}
                >
                  {m.content}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {timeFmt.format(new Date(m.created_at))}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No messages match these filters.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
