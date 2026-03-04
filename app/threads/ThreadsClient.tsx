'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

type ThreadListRow = {
    thread_id: string
    created_at: string
    other_user_id: string
    other_username: string | null
    other_display_name: string | null
    last_message_id: string | null
    last_message_type: 'scribble' | 'transform' | null
    last_message_sender_id: string | null
    last_message_created_at: string | null
    your_turn: boolean | null
}

const bypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === '1'

const DEV_THREADS: ThreadListRow[] = [
    {
        thread_id: 'dev-thread-1',
        created_at: new Date().toISOString(),
        other_user_id: 'dev-other-1',
        other_username: 'demo_friend',
        other_display_name: 'Jake',
        last_message_id: 'dev-msg-1',
        last_message_type: 'scribble',
        last_message_sender_id: 'dev-other-1',
        last_message_created_at: new Date().toISOString(),
        your_turn: true,
    },
    {
        thread_id: 'dev-thread-2',
        created_at: new Date(Date.now() - 3600_000).toISOString(),
        other_user_id: 'dev-other-2',
        other_username: 'second_friend',
        other_display_name: 'Mia',
        last_message_id: 'dev-msg-2',
        last_message_type: 'transform',
        last_message_sender_id: 'dev-me',
        last_message_created_at: new Date(Date.now() - 3600_000).toISOString(),
        your_turn: false,
    },
]

function timeAgo(iso: string | null) {
    if (!iso) return ''
    const t = new Date(iso).getTime()
    const s = Math.max(1, Math.floor((Date.now() - t) / 1000))
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const d = Math.floor(h / 24)
    return `${d}d`
}

export default function ThreadsClient() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), [])

    const [myId, setMyId] = useState<string | null>(null)

    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState<string | null>(null)
    const [threads, setThreads] = useState<ThreadListRow[]>([])

    const [inviteUsername, setInviteUsername] = useState('')
    const [creating, setCreating] = useState(false)

    const [myUsername, setMyUsername] = useState<string | null>(null)

    const loadThreads = useCallback(async () => {
        setErr(null)
        setLoading(true)

        if (bypass) {
            setMyId('dev-me')
            setThreads(DEV_THREADS)
            setLoading(false)
            return
        }

        // 1) Auth guard
        const { data: userRes } = await supabase.auth.getUser()
        if (!userRes.user) {
            window.location.href = '/sign-in'
            return
        }
        const nextMyId = userRes.user.id
        setMyId(nextMyId)

        // 2) Onboarding gate
        const { data: meProfile, error: meErr } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', nextMyId)
            .maybeSingle()

        if (meErr) {
            setErr(meErr.message)
            setLoading(false)
            return
        }
        if (!meProfile?.username) {
            window.location.href = '/onboarding'
            return
        }

        setMyUsername(meProfile?.username ?? null)

        // 3) Load threads via RPC
        const { data, error } = await supabase.rpc('list_threads_with_last_message')
        if (error) {
            setErr(error.message)
            setLoading(false)
            return
        }

        setThreads((data as ThreadListRow[]) ?? [])
        setLoading(false)
    }, [supabase])

    useEffect(() => {
        void loadThreads()
    }, [loadThreads])

    // Realtime (disabled in bypass): refetch only (most reliable)
    useEffect(() => {
        if (bypass) return
        if (!myId) return

        const channel = supabase
            .channel('threads:last-message')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
                void loadThreads()
            })
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [myId, supabase, loadThreads])

    const createOrOpenThreadByUsername = useCallback(async () => {
        const u = inviteUsername.trim().toLowerCase()
        if (!u) return

        // bypass: just open a demo thread so you can work UI
        if (bypass) {
            window.location.href = '/threads/dev-thread-1'
            return
        }

        setCreating(true)
        setErr(null)

        try {
            const { data: userRes } = await supabase.auth.getUser()
            if (!userRes.user) {
                window.location.href = '/sign-in'
                return
            }
            const nextMyId = userRes.user.id
            setMyId(nextMyId)

            const { data: other, error: findErr } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', u)
                .maybeSingle()

            if (findErr) throw findErr
            if (!other?.id) throw new Error('User not found')
            if (other.id === nextMyId) throw new Error("That's you 🙂")

            const { data: threadId, error: rpcErr } = await supabase.rpc('create_or_get_thread', {
                other_user_id: other.id,
            })
            if (rpcErr) throw rpcErr
            if (!threadId) throw new Error('No thread returned')

            setInviteUsername('')
            window.location.href = `/threads/${threadId}`
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to create/open thread'
            setErr(msg)
        } finally {
            setCreating(false)
        }
    }, [inviteUsername, supabase])

    return (
        <div className="h-screen bg-[#F6F4EF] text-[#0E2B24]">
            {/* Subtle top glow like your mock */}
            <div
                className="pointer-events-none fixed inset-x-0 -top-40 h-80 opacity-60 blur-3xl
                      bg-[radial-gradient(circle_at_top,#8CE13C22,transparent_55%)]"
            />

            <div className="mx-auto flex h-screen max-w-2xl flex-col px-4 pb-4">
                {/* Header */}
                <div className="sticky top-0 z-20 bg-[#F6F4EF] pt-4 pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-white shadow-sm ring-1 ring-black/5 grid place-items-center">
                                <span className="text-xl">🐸</span>
                            </div>
                            <div className="leading-tight">
                                <div className="text-2xl font-extrabold tracking-tight">Threads</div>
                                <div className="text-sm text-[#0E2B24]/60">Send scribbles. Transform. Reveal.</div>
                            </div>
                        </div>
                        <button
                            className="rounded-xl px-4 py-2 text-sm font-semibold
                       bg-white/70 hover:bg-white
                       ring-1 ring-black/10 shadow-sm"
                            onClick={async () => {
                                if (bypass) {
                                    window.location.replace('/sign-in')
                                    return
                                }
                                await supabase.auth.signOut()
                                window.location.replace('/sign-in')
                            }}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
                {/* Start a chat panel */}
                <div
                    className="rounded-3xl bg-white/70 backdrop-blur
                        ring-1 ring-black/10 shadow-sm p-5"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-base font-semibold">Start a chat, {myUsername}</div>
                            <div className="text-sm text-[#0E2B24]/60">Enter a username to open a 1:1 thread.</div>
                        </div>

                        <div className="hidden sm:flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#8CE13C]" />
                            <span className="text-xs text-[#0E2B24]/60">online</span>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <input
                            className="flex-1 rounded-2xl bg-white/80 px-4 py-3 text-sm
                         ring-1 ring-black/10 focus:outline-none
                         focus:ring-2 focus:ring-[#8CE13C]/60"
                            placeholder="friend username (e.g. racecar_az)"
                            value={inviteUsername}
                            onChange={(e) => setInviteUsername(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void createOrOpenThreadByUsername()
                            }}
                        />

                        <button
                            className="rounded-2xl px-5 py-3 text-sm font-semibold text-white
                         disabled:opacity-50
                         bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                         shadow-sm shadow-black/10"
                            disabled={creating}
                            onClick={createOrOpenThreadByUsername}
                        >
                            {creating ? 'Opening…' : 'Open'}
                        </button>
                    </div>
                </div>

                {/* Errors / loading */}
                {err && <div className="rounded-2xl bg-white/70 ring-1 ring-red-500/20 p-4 text-red-800">{err}</div>}
                {loading && <div className="text-sm text-[#0E2B24]/60">Loading…</div>}

                {/* Thread list */}
                <div className="space-y-3">
                    {!loading && threads.length === 0 && (
                        <div className="rounded-3xl bg-white/70 ring-1 ring-black/10 p-6 text-[#0E2B24]/70">No threads yet.</div>
                    )}

                    {threads.map((t) => {
                        const label = t.other_display_name?.trim() || t.other_username || 'Unknown user'
                        const subtitle = t.last_message_type ? `Last: ${t.last_message_type}` : 'No messages yet'
                        const when = timeAgo(t.last_message_created_at ?? t.created_at)

                        return (
                            <a
                                key={t.thread_id}
                                href={`/threads/${t.thread_id}`}
                                className="group block rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm
                           hover:bg-white hover:ring-black/15 transition p-5"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="truncate text-base font-semibold">{label}</div>
                                            {when ? <span className="text-xs text-[#0E2B24]/45">· {when}</span> : null}
                                        </div>

                                        <div className="mt-1 text-sm text-[#0E2B24]/60">
                                            {t.other_username ? `@${t.other_username} • ` : ''}
                                            {subtitle}
                                        </div>
                                    </div>

                                    {t.your_turn ? (
                                        <span
                                            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold
                                     bg-[#8CE13C]/20 text-[#0E2B24] ring-1 ring-[#8CE13C]/35"
                                        >
                                            Your turn
                                        </span>
                                    ) : (
                                        <span
                                            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold
                                     bg-black/5 text-[#0E2B24]/60 ring-1 ring-black/10"
                                        >
                                            Waiting
                                        </span>
                                    )}
                                </div>

                                <div className="mt-3 h-px bg-black/5" />
                                <div className="mt-3 text-xs text-[#0E2B24]/45 group-hover:text-[#0E2B24]/60">Open thread →</div>
                            </a>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}