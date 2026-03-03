'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ScribbleCanvas from '@/components/ScribbleCanvas'
import TransformCanvas from '@/components/TransformCanvas'
import RevealModal from '@/components/RevealModal'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'
import { sendImageMessage } from '@/lib/sendMessage'
import { getSignedUrl } from '@/lib/getSignedUrl'

type UiMessage = MessageRow & { url: string | null }

type MessageRow = {
    id: string
    thread_id: string
    sender_id: string
    type: 'scribble' | 'transform'
    image_path: string
    caption: string | null
    created_at: string
}

const bypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === '1'

function timeAgo(iso: string) {
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

export default function ThreadClient({ threadId }: { threadId: string }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), [])
    const [messages, setMessages] = useState<UiMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [showCanvas, setShowCanvas] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [myId, setMyId] = useState<string | null>(null)
    const [lastScribbleUrl, setLastScribbleUrl] = useState<string | null>(null)
    const [revealOpen, setRevealOpen] = useState(false)
    const [revealData, setRevealData] = useState<{ scribbleUrl: string; transformUrl: string; caption?: string | null } | null>(null)
    const listRef = useRef<HTMLDivElement | null>(null)
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const [stickToBottom, setStickToBottom] = useState(true)

    const onScroll = () => {
        const el = listRef.current
        if (!el) return
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        setStickToBottom(distanceFromBottom < 120)
    }

    const load = async () => {
        setErr(null)
        setLoading(true)

        if (bypass) {
            setMyId('dev-me')
            setMessages([
                {
                    id: 'dev-1',
                    thread_id: threadId,
                    sender_id: 'dev-other',
                    type: 'scribble',
                    image_path: '',
                    caption: null,
                    created_at: new Date(Date.now() - 120_000).toISOString(),
                    url: '/placeholder-scribble.png',
                },
                {
                    id: 'dev-2',
                    thread_id: threadId,
                    sender_id: 'dev-me',
                    type: 'transform',
                    image_path: '',
                    caption: 'Tyrannoscribble Rex',
                    created_at: new Date(Date.now() - 60_000).toISOString(),
                    url: '/placeholder-transform.png',
                },
            ])
            setLastScribbleUrl('/placeholder-scribble.png')
            setLoading(false)
            return
        }

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

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true })

        if (error) {
            setErr(error.message)
            setLoading(false)
            return
        }

        const withUrls = await Promise.all(
            (data as MessageRow[]).map(async (m) => {
                try {
                    const url = await getSignedUrl(m.image_path)
                    return { ...m, url }
                } catch {
                    return { ...m, url: null }
                }
            })
        )

        const last = withUrls[withUrls.length - 1]
        const next =
            !last
                ? 'send_scribble'
                : last.type === 'scribble' && last.sender_id !== userRes.user.id
                    ? 'send_transform'
                    : 'send_scribble'

        if (next === 'send_transform' && last) setLastScribbleUrl(last.url ?? null)
        else setLastScribbleUrl(null)

        setMessages(withUrls)
        setLoading(false)
    }

    useEffect(() => {
        void load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId])

    // Realtime (skip in bypass)
    useEffect(() => {
        if (bypass) return
        if (!threadId) return

        const channel = supabase
            .channel(`thread:${threadId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `thread_id=eq.${threadId}`,
                },
                async (payload) => {
                    const newMsg = payload.new as MessageRow

                    let url: string | null = null
                    try {
                        url = await getSignedUrl(newMsg.image_path)
                    } catch {
                        url = null
                    }

                    setMessages((prev) => {
                        if (prev.some((m) => m.id === newMsg.id)) return prev
                        const next = [...prev, { ...newMsg, url }]
                        next.sort((a, b) => a.created_at.localeCompare(b.created_at))
                        return next
                    })

                    setLastScribbleUrl((prevUnderlay) => {
                        if (!myId) return prevUnderlay
                        if (newMsg.type === 'scribble' && newMsg.sender_id !== myId) return url ?? prevUnderlay ?? null
                        return prevUnderlay
                    })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase, threadId, myId])

    useEffect(() => {
        if (!stickToBottom) return
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length, stickToBottom])

    const onDone = async (blob: Blob) => {
        try {
            setErr(null)
            setShowCanvas(false)

            if (bypass) {
                const id = crypto.randomUUID()
                const created_at = new Date().toISOString()
                setMessages((prev) => [
                    ...prev,
                    {
                        id,
                        thread_id: threadId,
                        sender_id: myId ?? 'dev-me',
                        type: 'scribble',
                        image_path: '',
                        caption: null,
                        created_at,
                        url: '/placeholder-scribble.png',
                    },
                ])
                return
            }

            await sendImageMessage({ threadId, type: 'scribble', pngBlob: blob })
        } catch (e: any) {
            setErr(e?.message ?? 'Failed to send scribble')
            setShowCanvas(true)
        }
    }

    const onTransformDone = async (blob: Blob, caption: string) => {
        try {
            setErr(null)
            setShowCanvas(false)

            const scribbleUrl = underlayUrl
            if (!scribbleUrl) throw new Error('Missing scribble underlay for reveal')

            if (bypass) {
                const id = crypto.randomUUID()
                const created_at = new Date().toISOString()
                const transformUrl = '/placeholder-transform.png'
                setRevealData({ scribbleUrl, transformUrl, caption })
                setRevealOpen(true)
                setMessages((prev) => [
                    ...prev,
                    {
                        id,
                        thread_id: threadId,
                        sender_id: myId ?? 'dev-me',
                        type: 'transform',
                        image_path: '',
                        caption,
                        created_at,
                        url: transformUrl,
                    },
                ])
                return
            }

            const { path } = await sendImageMessage({
                threadId,
                type: 'transform',
                pngBlob: blob,
                caption,
            })

            const transformUrl = await getSignedUrl(path)
            setRevealData({ scribbleUrl, transformUrl, caption })
            setRevealOpen(true)
        } catch (e: any) {
            setErr(e?.message ?? 'Failed to send transform')
            setShowCanvas(true)
        }
    }

    const forcedTransform = false // will remove in step B
    const last = messages[messages.length - 1]

    const nextAction =
        forcedTransform
            ? 'send_transform'
            : !last || !myId
                ? 'send_scribble'
                : last.type === 'scribble' && last.sender_id !== myId
                    ? 'send_transform'
                    : 'send_scribble'

    const lastScribble = [...messages].reverse().find((m) => m.type === 'scribble')
    const underlayUrl = forcedTransform ? (lastScribble?.url ?? null) : lastScribbleUrl

    const ctaLabel = showCanvas
        ? 'Close'
        : nextAction === 'send_transform'
            ? 'Transform'
            : 'New Scribble'

    return (
        <div className="min-h-screen bg-[#F6F4EF] text-[#0E2B24]">
            {/* subtle top glow */}
            <div className="pointer-events-none fixed inset-x-0 -top-40 h-80 opacity-60 blur-3xl
                      bg-[radial-gradient(circle_at_top,#8CE13C22,transparent_55%)]" />

            <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <a
                            href="/threads"
                            className="h-10 w-10 rounded-2xl bg-white/70 ring-1 ring-black/10 shadow-sm grid place-items-center
                         hover:bg-white transition"
                            aria-label="Back to threads"
                            title="Back"
                        >
                            ←
                        </a>

                        <div className="min-w-0">
                            <div className="text-xl font-extrabold tracking-tight truncate">Thread</div>
                            <div className="text-sm text-[#0E2B24]/60 truncate">
                                {nextAction === 'send_transform' ? 'Your turn to transform' : 'Your turn to scribble'}
                            </div>
                        </div>
                    </div>

                    <button
                        className="shrink-0 rounded-2xl px-5 py-3 text-sm font-semibold text-white
                       bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                       shadow-sm shadow-black/10 disabled:opacity-50"
                        onClick={() => setShowCanvas((v) => !v)}
                    >
                        {ctaLabel}
                    </button>
                </div>

                {err && (
                    <div className="rounded-2xl bg-white/70 ring-1 ring-red-500/20 p-4 text-red-800">
                        {err}
                    </div>
                )}

                {/* Composer slot */}
                {showCanvas && (
                    <div className="rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm p-4">
                        {nextAction === 'send_scribble' && <ScribbleCanvas onDone={onDone} softSeconds={60} />}

                        {nextAction === 'send_transform' && underlayUrl && (
                            <TransformCanvas underlayUrl={underlayUrl} onDone={onTransformDone} softSeconds={60} />
                        )}

                        {nextAction === 'send_transform' && !underlayUrl && (
                            <div className="rounded-2xl bg-white p-4 ring-1 ring-black/10">
                                No scribble found to use as underlay.
                            </div>
                        )}
                    </div>
                )}

                {/* Messages */}
                <div
                    ref={listRef}
                    onScroll={onScroll}
                    className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
                >
                    {loading && <div className="text-sm text-[#0E2B24]/60">Loading…</div>}

                    {!loading && messages.length === 0 && (
                        <div className="rounded-3xl bg-white/70 ring-1 ring-black/10 p-6 text-[#0E2B24]/70">
                            No messages yet. Send the first scribble 🐸
                        </div>
                    )}

                    {messages.map((m) => {
                        const mine = myId ? m.sender_id === myId : false
                        const pill =
                            m.type === 'scribble'
                                ? 'bg-[#0E2B24]/5 text-[#0E2B24]/70 ring-1 ring-black/10'
                                : 'bg-[#8CE13C]/20 text-[#0E2B24] ring-1 ring-[#8CE13C]/35'

                        return (
                            <div
                                key={m.id}
                                className="rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm p-4"
                            >
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${pill}`}>
                                            {m.type}
                                        </span>
                                        <span className="text-xs text-[#0E2B24]/50 truncate">
                                            {mine ? 'You' : 'Friend'} · {timeAgo(m.created_at)}
                                        </span>
                                    </div>

                                    <span className="text-xs text-[#0E2B24]/40">{mine ? '→' : '←'}</span>
                                </div>

                                {m.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={m.url}
                                        alt={m.type}
                                        className="w-full rounded-2xl ring-1 ring-black/10 bg-white"
                                    />
                                ) : (
                                    <div className="text-sm text-[#0E2B24]/60">Image unavailable</div>
                                )}

                                {m.caption && (
                                    <div className="mt-3 rounded-2xl bg-white/80 ring-1 ring-black/10 px-4 py-3">
                                        <div className="text-sm font-semibold">{m.caption}</div>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {!stickToBottom && (
                        <button
                            className="w-full rounded-2xl bg-white/70 ring-1 ring-black/10 py-3 text-sm font-semibold
                         hover:bg-white transition"
                            onClick={() => {
                                setStickToBottom(true)
                                bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
                            }}
                        >
                            Jump to latest ↓
                        </button>
                    )}

                    <div ref={bottomRef} />
                </div>

                <RevealModal
                    open={revealOpen}
                    onClose={() => setRevealOpen(false)}
                    scribbleUrl={revealData?.scribbleUrl ?? ''}
                    transformUrl={revealData?.transformUrl ?? ''}
                    caption={revealData?.caption ?? null}
                    onSendBack={() => {
                        setShowCanvas(true)
                    }}
                />
            </div>
        </div>
    )
}