import Link from 'next/link'
import React from 'react'
import Avatar from '../../components/ui/Avatar'
import { SignedIn, UserButton, SignedOut, SignInButton } from '@clerk/nextjs'
import { MobileSidebarTrigger } from './Sidebar'

function Header() {
  return (
    <div className="fixed top-4 md:top-6 left-0 right-0 z-50 flex justify-center px-3 md:px-4 pointer-events-none">
      <header className="pointer-events-auto flex items-center justify-between gap-2 px-3 py-2 md:px-6 md:py-3 rounded-full bg-card/60 backdrop-blur-xl border border-border shadow-2xl text-foreground w-full max-w-4xl transition-all duration-300 hover:border-primary/30">
        <div className="flex items-center md:hidden">
          <MobileSidebarTrigger />
        </div>
        <Link href="/" className="flex items-center gap-2 md:gap-3 group min-w-0">
          <div className="relative shrink-0">
            <Avatar seed="Katherine" className="h-8 w-8 rounded-full border border-border group-hover:border-primary transition-colors" />
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping pointer-events-none" />
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="display-font text-base md:text-lg font-extrabold leading-none truncate">
              Assistly
            </h1>
            <span className="text-[10px] mt-1 uppercase tracking-widest opacity-50 font-medium hidden sm:block">
              Custom AI Agent
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <SignedIn>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold">Administrator</p>
              </div>
              <UserButton appearance={{
                elements: {
                  avatarBox: "h-8 w-8 border border-border hover:border-primary transition-colors"
                }
              }} />
            </div>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="luxury-button text-xs py-1.5 px-3 md:px-4">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </header>
    </div>
  )
}

export default Header
