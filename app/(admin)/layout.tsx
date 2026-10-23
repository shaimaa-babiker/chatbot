import React from 'react'
import Header from '../../components/ui/Header';
import Sidebar, { MobileSidebarProvider } from '../../components/ui/Sidebar';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMyGlobalRole } from '@/lib/adminAccess';

async function AdminLayout  (
    {
        children,
      }: Readonly<{
        children: React.ReactNode;
      }>) {
    const {userId} = await auth()

    if (!userId) {
        return redirect("/login")
    }

    const role = await getMyGlobalRole(userId)

  return (
    <MobileSidebarProvider>
      <div className='flex flex-col flex-1 min-h-screen' >
          {/*header*/}
          <Header />
          <div className='flex flex-col lg:flex-row flex-1 bg-gray-100 text-gray-900 pt-24'>
              {/*sidebar*/}
              <Sidebar role={role} />
            <div className='flex-1 flex justify-center items-start lg:items-center max-w-5xl w-full mx-auto px-4 pb-10'>{children}</div>
          </div>
      </div>
    </MobileSidebarProvider>
  )
}

export default AdminLayout