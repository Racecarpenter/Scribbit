'use client'

import { useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const bypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === '1'

  useEffect(() => {
    const go = async () => {
      // DEV BYPASS: go straight to threads without auth checks
      if (bypass) {
        window.location.replace('/threads')
        return
      }

      const { data: userRes } = await supabase.auth.getUser()
      if (!userRes.user) {
        window.location.replace('/sign-in')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userRes.user.id)
        .maybeSingle()

      if (error) {
        window.location.href = '/onboarding'
        return
      }

      window.location.replace(profile?.username ? '/threads' : '/onboarding')
    }

    void go()
  }, [supabase, bypass])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-3xl">🐸</div>
        <div className="text-lg font-semibold">Scribb’it</div>
        <div className="text-sm text-gray-600">Loading…</div>
      </div>
    </main>
  )
}