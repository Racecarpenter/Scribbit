'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function OnboardingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ id: string; email?: string | null } | null>(null)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        window.location.href = '/sign-in'
        return
      }
      setMe({ id: data.user.id, email: data.user.email })

      // Fetch profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', data.user.id)
        .maybeSingle()

      if (error) {
        setErr(error.message)
        setLoading(false)
        return
      }

      // If already onboarded, go to threads
      if (profile?.username) {
        window.location.href = '/threads'
        return
      }

      setLoading(false)
    }

    init()
  }, [supabase])

  const save = async () => {
    setErr(null)
    if (!me) return

    const u = username.trim().toLowerCase()

    // basic validation
    if (u.length < 3) return setErr('Username must be at least 3 characters.')
    if (!/^[a-z0-9_]+$/.test(u)) return setErr('Use only letters, numbers, and underscores.')

    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: u,
          display_name: displayName.trim() || null,
        })
        .eq('id', me.id)

      if (error) throw error

      window.location.href = '/threads'
    } catch (e: any) {
      // Unique constraint errors come through here
      setErr(e?.message ?? 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-gray-600">Loading…</div>

  return (
    <div className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-bold">Set up your Scribb’it 🐸</h1>
      <p className="text-gray-600 text-sm">
        Pick a username so friends can find you.
      </p>

      {err && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{err}</div>}

      <div className="space-y-2">
        <label className="text-sm font-semibold">Username</label>
        <input
          className="w-full rounded-xl border p-3"
          placeholder="racecar_az"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="text-xs text-gray-500">letters/numbers/underscore only</div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">Display name (optional)</label>
        <input
          className="w-full rounded-xl border p-3"
          placeholder="Race"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <button
        className="w-full rounded-xl bg-green-600 py-3 text-white disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </div>
  )
}