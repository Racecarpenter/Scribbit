'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

const COOLDOWN_SECONDS = 60
const LS_KEY = 'scribbit:last_magiclink_sent_at'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function SignInPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const isDev = process.env.NODE_ENV !== 'production'

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const [cooldownLeft, setCooldownLeft] = useState(0)

  // Dev-only password login state
  const [devEmail, setDevEmail] = useState('')
  const [devPassword, setDevPassword] = useState('')
  const [devLoading, setDevLoading] = useState(false)
  const [devError, setDevError] = useState<string | null>(null)

  // If already authed, bounce to home router
  useEffect(() => {
    const go = async () => {
      const { data } = await supabase.auth.getUser()
      if (data.user) window.location.replace('/')
    }
    void go()
  }, [supabase])

  // Cooldown ticker (persisted)
  useEffect(() => {
    const readCooldown = () => {
      const last = Number(localStorage.getItem(LS_KEY) || '0')
      if (!last) return 0
      const diff = Math.floor((Date.now() - last) / 1000)
      return clamp(COOLDOWN_SECONDS - diff, 0, COOLDOWN_SECONDS)
    }

    setCooldownLeft(readCooldown())

    const t = setInterval(() => {
      setCooldownLeft(readCooldown())
    }, 250)

    return () => clearInterval(t)
  }, [])

  const sendLink = async () => {
    setErr(null)
    setStatus(null)

    const e = email.trim().toLowerCase()
    if (!e) return setErr('Enter your email.')
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr('Enter a valid email address.')

    if (cooldownLeft > 0) {
      setErr(`Please wait ${cooldownLeft}s before requesting another link.`)
      return
    }

    setSending(true)
    try {
      // IMPORTANT: ensure your redirect URL matches your local/prod host allowed in Supabase Auth settings
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          emailRedirectTo: redirectTo,
        },
      })

      if (error) throw error

      localStorage.setItem(LS_KEY, String(Date.now()))
      setStatus('Check your email for the sign-in link.')
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : 'Failed to send sign-in link.'

      if (msg.toLowerCase().includes('rate limit')) {
        setErr('Rate limit hit. Try again later, or use a link you already received.')
      } else {
        setErr(msg)
      }
    } finally {
      setSending(false)
    }
  }

  const devSignInWithPassword = async () => {
    if (!isDev) return

    setDevError(null)
    setStatus(null)
    setErr(null)

    const e = devEmail.trim().toLowerCase()
    if (!e) {
      setDevError('Enter your email.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      setDevError('Enter a valid email address.')
      return
    }
    if (!devPassword) {
      setDevError('Enter your password.')
      return
    }

    setDevLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: e,
        password: devPassword,
      })
      if (error) throw error

      // Your existing auth gate effect will redirect on next run,
      // but we can be explicit to reduce confusion.
      window.location.replace('/')
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : 'Failed to sign in.'
      setDevError(msg)
    } finally {
      setDevLoading(false)
    }
  }

  const disabled = sending || cooldownLeft > 0
  const devDisabled = devLoading || !devEmail.trim() || !devPassword

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#0E2B24]">
      {/* subtle top glow */}
      <div
        className="pointer-events-none fixed inset-x-0 -top-40 h-80 opacity-60 blur-3xl
                      bg-[radial-gradient(circle_at_top,#8CE13C22,transparent_55%)]"
      />

      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full space-y-6">
          {/* Logo + title */}
          <div className="flex flex-col items-center text-center">
            <div className="relative h-24 w-24 overflow-hidden rounded-[28px] bg-white/70 ring-1 ring-black/10 shadow-sm">
              <Image src="/scribbit-logo.png" alt="Scribb’it" fill className="object-contain p-2" priority />
            </div>

            <div className="mt-4 text-3xl font-extrabold tracking-tight">Scribb’it</div>
            <div className="mt-1 text-sm text-[#0E2B24]/60">Send scribbles. Transform. Reveal.</div>
          </div>

          {/* Card */}
          <div className="rounded-3xl bg-white/70 backdrop-blur ring-1 ring-black/10 shadow-sm p-5 space-y-4">
            <div className="space-y-1">
              <div className="text-base font-semibold">Sign in</div>
              <div className="text-sm text-[#0E2B24]/60">We’ll email you a magic link.</div>
            </div>

            {err && (
              <div className="rounded-2xl bg-white/70 ring-1 ring-red-500/20 p-3 text-red-800">
                {err}
              </div>
            )}

            {status && (
              <div className="rounded-2xl bg-white/70 ring-1 ring-black/10 p-3 text-[#0E2B24]">
                {status}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold">Email</label>
              <input
                className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm
                           ring-1 ring-black/10 focus:outline-none
                           focus:ring-2 focus:ring-[#8CE13C]/60"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendLink()
                }}
                inputMode="email"
                autoComplete="email"
              />
              <div className="text-xs text-[#0E2B24]/50">
                If you hit rate limits, use an older link in your inbox instead of requesting a new one.
              </div>
            </div>

            <button
              className="w-full rounded-2xl px-5 py-3 text-sm font-extrabold text-white
                         disabled:opacity-50
                         bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                         shadow-sm shadow-black/10 active:scale-[0.99] transition"
              onClick={sendLink}
              disabled={disabled}
            >
              {sending ? 'Sending…' : cooldownLeft > 0 ? `Wait ${cooldownLeft}s…` : 'Send magic link'}
            </button>

            <div className="text-xs text-[#0E2B24]/45">
              Dev note: magic link emails are rate-limited. Consider custom SMTP later.
            </div>

            {/* Dev-only password login */}
            {isDev ? (
              <div className="pt-4 border-t border-black/10 space-y-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#0E2B24]">Dev password login</div>
                  <div className="text-xs text-[#0E2B24]/55">
                    Dev-only fallback to avoid Supabase email rate limits.
                  </div>
                </div>

                {devError ? (
                  <div className="rounded-2xl bg-white/70 ring-1 ring-red-500/20 p-3 text-red-800">
                    {devError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Email (dev)</label>
                  <input
                    className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm
                               ring-1 ring-black/10 focus:outline-none
                               focus:ring-2 focus:ring-[#0B73E5]/30"
                    placeholder="you@domain.com"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void devSignInWithPassword()
                    }}
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password (dev)</label>
                  <input
                    className="w-full rounded-2xl bg-white/80 px-4 py-3 text-sm
                               ring-1 ring-black/10 focus:outline-none
                               focus:ring-2 focus:ring-[#0B73E5]/30"
                    placeholder="••••••••"
                    type="password"
                    value={devPassword}
                    onChange={(e) => setDevPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void devSignInWithPassword()
                    }}
                    autoComplete="current-password"
                  />
                </div>

                <button
                  className="w-full rounded-2xl px-5 py-3 text-sm font-extrabold text-white
                             disabled:opacity-50
                             bg-[linear-gradient(90deg,#0E2B24_0%,#0B73E5_60%,#19C9C3_110%)]
                             shadow-sm shadow-black/10 active:scale-[0.99] transition"
                  onClick={devSignInWithPassword}
                  disabled={devDisabled}
                >
                  {devLoading ? 'Signing in…' : 'Sign in (dev)'}
                </button>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-[#0E2B24]/45">
            By continuing, you agree this is an MVP and emails may be throttled.
          </div>
        </div>
      </div>
    </div>
  )
}