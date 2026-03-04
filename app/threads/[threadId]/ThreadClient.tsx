'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScribbleCanvas from '@/components/ScribbleCanvas'
import TransformCanvas from '@/components/TransformCanvas'
import RevealModal from '@/components/RevealModal'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'
import { sendImageMessage } from '@/lib/sendMessage'
import { getSignedUrl } from '@/lib/getSignedUrl'
import Link from 'next/link'

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

  const [revealOpen, setRevealOpen] = useState(false)
  const [revealData, setRevealData] = useState<{
    scribbleUrl: string
    transformUrl: string
    caption?: string | null
  } | null>(null)

  const [lastRevealedTransformId, setLastRevealedTransformId] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const [stickToTop, setStickToTop] = useState(true)

  const onScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setStickToTop(el.scrollTop < 120)
  }, [])

  const loadMessages = useCallback(async () => {
    setErr(null)
    setLoading(true)

    if (bypass) {
      const devMe = 'dev-me'
      setMyId(devMe)

      const devMsgs: UiMessage[] = [
        {
          id: 'dev-2',
          thread_id: threadId,
          sender_id: devMe,
          type: 'transform',
          image_path: '',
          caption: 'Tyrannoscribble Rex',
          created_at: new Date(Date.now() - 60_000).toISOString(),
          url: '/placeholder-transform.png',
        },
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
      ]

      setMessages(devMsgs)
      setLoading(false)
      return
    }

    const { data: userRes } = await supabase.auth.getUser()
    if (!userRes.user) {
      window.location.href = '/sign-in'
      return
    }
    const uid = userRes.user.id
    setMyId(uid)

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', uid)
      .maybeSingle()

    if (!profile?.username) {
      window.location.href = '/onboarding'
      return
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false }) // newest first

    if (error) {
      setErr(error.message)
      setLoading(false)
      return
    }

    const rows = (data as MessageRow[]) ?? []

    const withUrls = await Promise.all(
      rows.map(async (m) => {
        try {
          const url = await getSignedUrl(m.image_path)
          return { ...m, url }
        } catch {
          return { ...m, url: null }
        }
      })
    )

    setMessages(withUrls)
    setLoading(false)
  }, [supabase, threadId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  // Realtime (skip in bypass): refetch on insert for correctness + lint safety
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
        () => {
          void loadMessages()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, threadId, loadMessages])

  useEffect(() => {
    if (!stickToTop) return
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, stickToTop])

  // Newest message (since we load newest-first)
  const last = messages[0] ?? null

  const nextAction = useMemo<'send_scribble' | 'send_transform'>(() => {
    if (!last || !myId) return 'send_scribble'
    if (last.type === 'scribble' && last.sender_id !== myId) return 'send_transform'
    return 'send_scribble'
  }, [last, myId])

  const canAct = useMemo(() => {
    if (!myId) return false
    if (!last) return true // first move
    // Waiting only when last was YOUR scribble (friend must transform)
    if (last.type === 'scribble' && last.sender_id === myId) return false
    return true
  }, [last, myId])

  const headerSubtitle = useMemo(() => {
    if (!myId) return 'Loading…'
    if (!last) return 'Your turn to scribble'
    if (last.type === 'scribble' && last.sender_id === myId) return 'Waiting for friend to transform'
    if (nextAction === 'send_transform') return 'Your turn to transform'
    return 'Your turn to scribble'
  }, [last, myId, nextAction])

  const ctaLabel = useMemo(() => {
    if (showCanvas) return 'Close'
    if (nextAction === 'send_transform') return 'Transform'
    return 'New Scribble'
  }, [showCanvas, nextAction])

  // Underlay for TransformCanvas = most recent scribble url (newest-first)
  const underlayUrl = useMemo(() => {
    for (let i = 0; i < messages.length; i += 1) {
      const m = messages[i]
      if (m.type === 'scribble') return m.url ?? null
    }
    return null
  }, [messages])

  // Reveal rule (newest-first):
  // - Only open RevealModal when we receive a NEW transform from the other user.
  // - Find the first scribble AFTER that transform in the array (older message).
  useEffect(() => {
    if (!myId) return
    if (messages.length === 0) return

    const latestTransform = messages.find((m) => m.type === 'transform') ?? null
    if (!latestTransform) return

    if (latestTransform.sender_id === myId) return
    if (latestTransform.id === lastRevealedTransformId) return

    const idx = messages.findIndex((m) => m.id === latestTransform.id)
    if (idx === -1) return

    let scribbleUrl: string | null = null
    for (let i = idx + 1; i < messages.length; i += 1) {
      const m = messages[i]
      if (m.type === 'scribble') {
        scribbleUrl = m.url ?? null
        break
      }
    }

    if (!scribbleUrl || !latestTransform.url) return

    setShowCanvas(false)
    setRevealData({
      scribbleUrl,
      transformUrl: latestTransform.url,
      caption: latestTransform.caption,
    })
    setRevealOpen(true)
    setLastRevealedTransformId(latestTransform.id)
  }, [messages, myId, lastRevealedTransformId])

  const onDone = useCallback(
    async (blob: Blob) => {
      try {
        setErr(null)
        setShowCanvas(false)

        if (bypass) {
          const id = crypto.randomUUID()
          const created_at = new Date().toISOString()
          setMessages((prev) => [
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
            ...prev,
          ])
          return
        }

        await sendImageMessage({ threadId, type: 'scribble', pngBlob: blob })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to send scribble'
        setErr(msg)
        setShowCanvas(true)
      }
    },
    [myId, threadId]
  )

  const onTransformDone = useCallback(
    async (blob: Blob, caption: string) => {
      try {
        setErr(null)
        setShowCanvas(false)

        if (!underlayUrl) throw new Error('Missing scribble underlay')

        if (bypass) {
          // In bypass/dev, keep instant reveal to demo
          const id = crypto.randomUUID()
          const created_at = new Date().toISOString()
          const transformUrl = '/placeholder-transform.png'
          setRevealData({ scribbleUrl: underlayUrl, transformUrl, caption })
          setRevealOpen(true)
          setMessages((prev) => [
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
            ...prev,
          ])
          return
        }

        await sendImageMessage({
          threadId,
          type: 'transform',
          pngBlob: blob,
          caption,
        })

        // IMPORTANT: Do NOT reveal to the sender.
        // Receiver reveals when transform arrives via realtime/refetch.
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to send transform'
        setErr(msg)
        setShowCanvas(true)
      }
    },
    [myId, threadId, underlayUrl]
  )

  return (
    <div className="h-screen bg-[#F6F4EF] text-[#0E2B24]">
      <div
        className="pointer-events-none fixed inset-x-0 -top-40 h-80 opacity-60 blur-3xl
                      bg-[radial-gradient(circle_at_top,#8CE13C22,transparent_55%)]"
      />

      <div className="mx-auto flex h-screen max-w-2xl flex-col px-4 pb-4">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-[#F6F4EF] pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/threads"
                className="h-10 w-10 rounded-2xl bg-white/70 ring-1 ring-black/10 shadow-sm grid place-items-center
                         hover:bg-white transition"
                aria-label="Back to threads"
                title="Back"
              >
                ←
              </Link>

              <div className="min-w-0">
                <div className="text-xl font-extrabold tracking-tight truncate">Thread</div>
                <div className="text-sm text-[#0E2B24]/60 truncate">{headerSubtitle}</div>
              </div>
            </div>

            <button
              className="shrink-0 rounded-2xl px-5 py-3 text-sm font-semibold text-white
                       bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                       shadow-sm shadow-black/10 disabled:opacity-50"
              onClick={() => {
                if (!canAct) return
                setShowCanvas((v) => !v)
              }}
              disabled={!canAct}
              title={!canAct ? 'Waiting for your friend…' : undefined}
            >
              {ctaLabel}
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-3 rounded-2xl bg-white/70 ring-1 ring-red-500/20 p-4 text-red-800">{err}</div>
        )}

        {/* Composer slot */}
        {showCanvas && (
          <div className="mb-3 rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm p-4">
            {nextAction === 'send_scribble' && <ScribbleCanvas onDone={onDone} softSeconds={6} />}

            {nextAction === 'send_transform' && underlayUrl && (
              <TransformCanvas underlayUrl={underlayUrl} onDone={onTransformDone} softSeconds={6} />
            )}

            {nextAction === 'send_transform' && !underlayUrl && (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-black/10">
                No scribble found to use as underlay.
              </div>
            )}
          </div>
        )}

        {/* Messages (only scrolling area) */}
        <div
          ref={listRef}
          onScroll={onScroll}
          className="flex-1 space-y-4 overflow-y-auto pr-1 pb-2"
        >
          <div ref={topRef} />

          {loading && <div className="text-sm text-[#0E2B24]/60">Loading…</div>}

          {!loading && messages.length === 0 && (
            <div className="rounded-3xl bg-white/70 ring-1 ring-black/10 p-6 text-[#0E2B24]/70">
              No messages yet. Send the first scribble 🐸
            </div>
          )}

          {!stickToTop && (
            <button
              className="w-full rounded-2xl bg-white/70 ring-1 ring-black/10 py-3 text-sm font-semibold hover:bg-white transition"
              onClick={() => {
                setStickToTop(true)
                topRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Jump to newest ↑
            </button>
          )}

          {messages.map((m) => {
            const mine = myId ? m.sender_id === myId : false
            const pill =
              m.type === 'scribble'
                ? 'bg-[#0E2B24]/5 text-[#0E2B24]/70 ring-1 ring-black/10'
                : 'bg-[#8CE13C]/20 text-[#0E2B24] ring-1 ring-[#8CE13C]/35'

            return (
              <div key={m.id} className="rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm p-4">
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
                  <img src={m.url} alt={m.type} className="w-full rounded-2xl ring-1 ring-black/10 bg-white" />
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