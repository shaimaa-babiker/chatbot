import Avatar from '@/components/ui/Avatar'
import { SignIn } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import React from 'react'

async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>
}) {
  const params = await searchParams
  const isInvited = params.invited === '1'

  // If the user is already signed in and they landed here via an invite link,
  // send them straight to review-sessions — no cookie needed.
  if (isInvited) {
    const { userId } = await auth()
    if (userId) redirect('/review-sessions')
  }

  const fallbackRedirectUrl = isInvited ? '/review-sessions' : '/'
  const signUpUrl = isInvited ? '/sign-up?invited=1' : '/sign-up'

  return (
    <div className='flex py-10 md:py-0 flex-col flex-1 justify-center items-center bg-[#64B5F5] min-h-screen px-4'>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-5xl">
        <div className="flex flex-col items-center justify-center space-y-5 text-white">
          <div className="rounded-full bg-white p-5">
            <Avatar seed='PAPAFAM' className='w-32 h-32 md:w-50 md:h-50' />
          </div>
          <div className="text-center">
            <h1 className="text-4xl">Assistly</h1>
            <h2 className="text-base font-light">
              Your Customisable AI Chat Agent
            </h2>
            <h3 className="my-5 font-bold">
              Sign in to get started
            </h3>
          </div>
        </div>
        <SignIn fallbackRedirectUrl={fallbackRedirectUrl} signUpUrl={signUpUrl} />
      </div>
    </div>
  )
}

export default LoginPage
