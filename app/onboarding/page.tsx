'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
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
      setErr(null)
      setLoading(true)

      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        window.location.href = '/sign-in'
        return
      }

      const { data: sess } = await supabase.auth.getSession()
      console.log('session?', sess.session?.user?.id)

      const user = data.user
      setMe({ id: user.id, email: user.email })

      // Fetch profile (if readable)
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', user.id)
        .maybeSingle()

      // If already onboarded, skip
      if (!error && profile?.username) {
        window.location.href = '/threads'
        return
      }

      // Optional: prefill display name
      if (!error && profile?.display_name) setDisplayName(profile.display_name)

      setLoading(false)
    }

    void init()
  }, [supabase])

  const save = async () => {
    setErr(null)
    if (!me) return

    const u = username.trim().toLowerCase()

    if (u.length < 3) return setErr('Username must be at least 3 characters.')
    if (!/^[a-z0-9_]+$/.test(u)) return setErr('Use only letters, numbers, and underscores.')

    setSaving(true)
    try {
      // Upsert so it works whether the row exists or not
      const { error } = await supabase
        .from('profiles')
        .upsert(
          { id: me.id, email: me.email ?? null, username: u, display_name: displayName.trim() || null },
          { onConflict: 'id' }
        )

      if (error) throw error

      window.location.href = '/threads'
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save profile'
      if (msg.includes('profiles_username_key') || msg.includes('duplicate key')) {
        setErr('That username is already taken. Try another.')
      } else {
        setErr(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F4EF] text-[#0E2B24] flex items-center justify-center">
        <div className="text-sm text-[#0E2B24]/60">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#0E2B24]">
      {/* subtle top glow */}
      <div className="pointer-events-none fixed inset-x-0 -top-40 h-80 opacity-60 blur-3xl
                      bg-[radial-gradient(circle_at_top,#8CE13C22,transparent_55%)]" />

      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full space-y-6">
          {/* Logo + title */}
          <div className="flex flex-col items-center text-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-[24px] bg-white/70 ring-1 ring-black/10 shadow-sm">
              <Image
                src="/scribbit-logo.png"
                alt="Scribb’it"
                fill
                className="object-contain p-2"
                priority
              />
            </div>

            <div className="mt-4 text-2xl font-extrabold tracking-tight">Set up your account</div>
            <div className="mt-1 text-sm text-[#0E2B24]/60">
              Pick a username so friends can find you.
            </div>
          </div>

          {/* Card */}
          <div className="rounded-3xl bg-white/70 backdrop-blur ring-1 ring-black/10 shadow-sm p-5 space-y-4">
            {err && (
              <div className="rounded-2xl bg-white/70 ring-1 ring-red-500/20 p-3 text-red-800">
                {err}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold">Username</label>
              <input
                className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm
                           ring-1 ring-black/10 focus:outline-none
                           focus:ring-2 focus:ring-[#8CE13C]/60"
                placeholder="racecar_az"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save()
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="text-xs text-[#0E2B24]/50">
                letters/numbers/underscore only
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Display name (optional)</label>
              <input
                className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm
                           ring-1 ring-black/10 focus:outline-none
                           focus:ring-2 focus:ring-[#8CE13C]/60"
                placeholder="Race"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <button
              className="w-full rounded-2xl px-5 py-3 text-sm font-extrabold text-white
                         disabled:opacity-50
                         bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                         shadow-sm shadow-black/10 active:scale-[0.99] transition"
              disabled={saving}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>

            <div className="text-xs text-[#0E2B24]/45">
              You can change your display name later.
            </div>
          </div>

          <div className="text-center text-xs text-[#0E2B24]/45">
            Tip: usernames are unique and case-insensitive.
          </div>
        </div>
      </div>
    </div>
  )
}