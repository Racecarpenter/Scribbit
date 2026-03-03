'use client'

import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function Home() {
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    const go = async () => {
      const { data } = await supabase.auth.getUser()
      window.location.href = data.user ? '/threads' : '/sign-in'
    }
    go()
  }, [supabase])

  return null
}