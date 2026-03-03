'use client'

import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function AuthCallback() {
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    const finalize = async () => {
      await supabase.auth.getSession()
      window.location.href = '/'
    }

    finalize()
  }, [supabase])

  return <p className="p-8">Signing you in...</p>
}