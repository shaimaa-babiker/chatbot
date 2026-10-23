'use client'
import Link from 'next/link'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { BotMessageSquare, PencilLine, SearchIcon, Users, X, Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'

type Role = 'owner' | 'editor' | 'viewer' | null

const navItems = [
  {
    href: '/create-chatbot',
    icon: BotMessageSquare,
    label: 'Create',
    sub: 'New Chatbot',
    id: 'create',
    ownerOnly: true,
  },
  {
    href: '/view-chatbots',
    icon: PencilLine,
    label: 'Edit',
    sub: 'Manage Bots',
    id: 'edit',
    ownerOnly: true,
  },
  {
    href: '/review-sessions',
    icon: SearchIcon,
    label: 'View',
    sub: 'Chat History',
    id: 'review',
    ownerOnly: false,
  },
  {
    href: '/admin-users',
    icon: Users,
    label: 'Team',
    sub: 'Permissions',
    id: 'team',
    ownerOnly: true,
  },
] as const


/* -------------------------------------------------------------------------- */
/*  Mobile sidebar — shared open/close state                                  */
/* -------------------------------------------------------------------------- */

const MobileSidebarContext = createContext<{
  open: boolean
  setOpen: (v: boolean) => void
} | null>(null)

function useMobileSidebar() {
  const ctx = useContext(MobileSidebarContext)
  if (!ctx) throw new Error('useMobileSidebar must be used inside MobileSidebarProvider')
  return ctx
}

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <MobileSidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileSidebarContext.Provider>
  )
}

export function MobileSidebarTrigger({ className = '' }: { className?: string }) {
  const { setOpen } = useMobileSidebar()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      className={`rounded-full p-2 hover:bg-accent transition-colors ${className}`}
    >
      <Menu className="h-5 w-5" />
    </button>
  )
}

export function MobileSidebarOverlay({ role }: { role?: Role }) {
  const { open, setOpen } = useMobileSidebar()
  const pathname = usePathname()
  const isViewerLike = role === 'viewer' || role === 'editor'
  const visibleItems = navItems.filter(item => !isViewerLike || !item.ownerOnly)

  if (!open) return null

  return (
    <div className="lg:hidden fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-background shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-semibold text-lg">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-2 hover:bg-accent"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 flex flex-col gap-2 p-3">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`
                  flex items-center gap-4 p-4 rounded-2xl transition-all
                  ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent'}
                `}
              >
                <item.icon className="h-5 w-5" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold uppercase tracking-tight">
                    {item.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest opacity-60">
                    {item.sub}
                  </span>
                </div>
              </Link>
            )
          })}
        </nav>
      </aside>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sidebar — desktop full sidebar + mobile icon strip                         */
/* -------------------------------------------------------------------------- */

export default function Sidebar({ role }: { role?: Role }) {
  const pathname = usePathname()
  const { setOpen } = useMobileSidebar()
  const isViewerLike = role === 'viewer' || role === 'editor'
  const visibleItems = navItems.filter(item => !isViewerLike || !item.ownerOnly)

  return (
    <>
      <aside className="hidden lg:flex flex-shrink-0 w-64 px-2 py-2">
        <nav className="h-full w-full flex flex-col gap-3 p-2 rounded-3xl bg-card/40 backdrop-blur-lg border border-border shadow-xl">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`
                  group relative flex items-center gap-4 p-4 rounded-2xl transition-all duration-300
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(192,255,0,0.3)]'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'}
                `}
              >
                <div
                  className={`transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary'}`}
                >
                  <item.icon className="h-6 w-6" />
                </div>

                <div className="flex flex-col overflow-hidden">
                  <span className="display-font text-sm font-bold leading-none uppercase tracking-tight">
                    {item.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest opacity-60 font-medium">
                    {item.sub}
                  </span>
                </div>

                {isActive && (
                  <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-r-full" />
                )}
              </Link>
            )
          })}
        </nav>
      </aside>

      <aside className="lg:hidden flex-shrink-0 w-20 flex flex-col items-center py-2">
        <nav className="h-full w-full flex flex-col gap-3 p-2 rounded-3xl bg-card/40 backdrop-blur-lg border border-border shadow-xl">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-label={item.label}
                className={`
                  group relative flex items-center justify-center p-4 rounded-2xl transition-all duration-300
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(192,255,0,0.3)]'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'}
                `}
              >
                <item.icon className="h-6 w-6" />
                {isActive && (
                  <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-r-full" />
                )}
              </Link>
            )
          })}
        </nav>
      </aside>

      <MobileSidebarOverlay role={role} />
    </>
  )
}
