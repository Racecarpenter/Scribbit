'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

type ThreadRow = {
    id: string
    user1: string
    user2: string
    created_at: string
}

type ProfileRow = {
    id: string
    username: string | null
    phone: string | null
}

export default function ThreadsClient() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), [])
    const [myId, setMyId] = useState<string | null>(null)
    const [threads, setThreads] = useState<(ThreadRow & { other?: ProfileRow | null })[]>([])
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState<string | null>(null)

    // MVP “start chat” input (email -> find user -> create thread)
    const [inviteEmail, setInviteEmail] = useState('')
    const [creating, setCreating] = useState(false)

    const load = async () => {
        setErr(null)
        setLoading(true)

        const { data: userRes } = await supabase.auth.getUser()
        if (!userRes.user) {
            window.location.href = '/sign-in'
            return
        }
        setMyId(userRes.user.id)

        const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', userRes.user.id)
            .maybeSingle()

        if (!profile?.username) {
            window.location.href = '/onboarding'
            return
        }

        const { data: threadRows, error: threadErr } = await supabase
            .from('threads')
            .select('*')
            .or(`user1.eq.${userRes.user.id},user2.eq.${userRes.user.id}`)
            .order('created_at', { ascending: false })

        if (threadErr) {
            setErr(threadErr.message)
            setLoading(false)
            return
        }

        const rows = (threadRows as ThreadRow[]) ?? []
        const otherIds = rows.map((t) => (t.user1 === userRes.user.id ? t.user2 : t.user1))

        // Fetch other profiles
        const { data: profiles, error: profErr } = await supabase
            .from('profiles')
            .select('id, username, phone')
            .in('id', otherIds)

        if (profErr) {
            setErr(profErr.message)
            setLoading(false)
            return
        }

        const profMap = new Map((profiles as ProfileRow[]).map((p) => [p.id, p]))
        setThreads(rows.map((t) => ({ ...t, other: profMap.get(t.user1 === userRes.user.id ? t.user2 : t.user1) ?? null })))
        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const createThreadByEmail = async () => {
        if (!inviteEmail.trim()) return
        setCreating(true)
        setErr(null)

        try {
            if (!myId) throw new Error('Not ready yet')

            // Find auth user by email is not possible from client safely.
            // MVP workaround: store email in profiles and query it.
            // If you didn’t store email in profiles, do that next (I’ll show you).
            const { data: match, error: matchErr } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', inviteEmail.trim()) // TEMP: use username field as “email” until we add email column
                .maybeSingle()

            if (matchErr) throw matchErr
            if (!match?.id) throw new Error('User not found (for MVP, set their profiles.username to their email).')

            const otherId = match.id as string

            const { error: insErr } = await supabase.from('threads').insert({
                user1: myId,
                user2: otherId,
            })

            if (insErr) throw insErr

            setInviteEmail('')
            await load()
        } catch (e: any) {
            setErr(e?.message ?? 'Failed to create thread')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="mx-auto max-w-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Threads</h1>
                <button
                    className="rounded border px-3 py-2"
                    onClick={async () => {
                        await supabase.auth.signOut()
                        window.location.href = '/sign-in'
                    }}
                >
                    Sign out
                </button>
            </div>

            <div className="rounded-2xl border bg-white p-4 space-y-2">
                <div className="font-semibold">Start a chat (MVP)</div>
                <div className="text-sm text-gray-600">
                    Temporary: set your friend’s <code>profiles.username</code> to their email so you can find them.
                </div>
                <div className="flex gap-2">
                    <input
                        className="flex-1 rounded-xl border p-3"
                        placeholder="friend email (temporary uses username)"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <button
                        className="rounded-xl bg-green-600 px-4 text-white disabled:opacity-50"
                        disabled={creating}
                        onClick={createThreadByEmail}
                    >
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>

            {err && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{err}</div>}
            {loading && <div className="text-gray-600">Loading…</div>}

            <div className="space-y-2">
                {!loading && threads.length === 0 && (
                    <div className="rounded-2xl border bg-white p-4">No threads yet.</div>
                )}

                {threads.map((t) => (
                    <a
                        key={t.id}
                        href={`/threads/${t.id}`}
                        className="block rounded-2xl border bg-white p-4 hover:bg-gray-50"
                    >
                        <div className="font-semibold">
                            {t.other?.username ?? t.other?.phone ?? 'Unknown user'}
                        </div>
                        <div className="text-sm text-gray-600">Tap to open</div>
                    </a>
                ))}
            </div>
        </div>
    )
}