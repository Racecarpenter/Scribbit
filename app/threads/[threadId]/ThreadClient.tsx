'use client'

import { useEffect, useMemo, useState } from 'react'
import ScribbleCanvas from '@/components/ScribbleCanvas'
import TransformCanvas from '@/components/TransformCanvas'
import RevealModal from '@/components/RevealModal'
import { createSupabaseBrowserClient } from '@/lib/supabaseClient'
import { sendImageMessage } from '@/lib/sendMessage'
import { getSignedUrl } from '@/lib/getSignedUrl'

type MessageRow = {
    id: string
    thread_id: string
    sender_id: string
    type: 'scribble' | 'transform'
    image_path: string
    caption: string | null
    created_at: string
}

export default function ThreadClient({ threadId }: { threadId: string }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), [])
    const [messages, setMessages] = useState<(MessageRow & { url?: string })[]>([])
    const [loading, setLoading] = useState(true)
    const [showCanvas, setShowCanvas] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [myId, setMyId] = useState<string | null>(null)
    const [lastScribbleUrl, setLastScribbleUrl] = useState<string | null>(null)
    const [revealOpen, setRevealOpen] = useState(false)
    const [revealData, setRevealData] = useState<{ scribbleUrl: string; transformUrl: string; caption?: string | null } | null>(null)

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
                    return { ...m }
                }
            })
        )

        const last = withUrls[withUrls.length - 1]
        const newLocal_2 = last.type === 'scribble' && last.sender_id !== userRes.user.id
            ? 'send_transform'
            : 'send_scribble'
        const next =
            !last
                ? 'send_scribble'
                : newLocal_2

        if (next === 'send_transform' && last) {
            setLastScribbleUrl(last.url ?? null)
        } else {
            setLastScribbleUrl(null)
        }

        setMessages(withUrls)
        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId])

    const onDone = async (blob: Blob) => {
        try {
            setErr(null)
            setShowCanvas(false)
            await sendImageMessage({ threadId, type: 'scribble', pngBlob: blob })
            await load()
        } catch (e: any) {
            setErr(e?.message ?? 'Failed to send scribble')
            setShowCanvas(true)
        }
    }

    const onTransformDone = async (blob: Blob, caption: string) => {
        try {
            setErr(null)
            setShowCanvas(false)

            // capture the current underlay before reload changes it
            const scribbleUrl = underlayUrl
            if (!scribbleUrl) throw new Error('Missing scribble underlay for reveal')

            const { path } = await sendImageMessage({
                threadId,
                type: 'transform',
                pngBlob: blob,
                caption,
            })

            // signed URL for the transform we just uploaded
            const transformUrl = await getSignedUrl(path)

            setRevealData({ scribbleUrl, transformUrl, caption })
            setRevealOpen(true)

            await load()
        } catch (e: any) {
            setErr(e?.message ?? 'Failed to send transform')
            setShowCanvas(true)
        }
    }

    const forcedTransform = false // set true to test transform any time
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

    return (
        <div className="mx-auto max-w-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">Thread</h1>
                <button
                    className="rounded bg-green-600 px-3 py-2 text-white"
                    onClick={() => setShowCanvas((v) => !v)}
                >
                    {showCanvas ? 'Close' : nextAction === 'send_transform' ? 'Transform' : 'New Scribble'}
                </button>
            </div>

            {err && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{err}</div>}

            {showCanvas && nextAction === 'send_scribble' && <ScribbleCanvas onDone={onDone} softSeconds={60} />}

            {showCanvas && nextAction === 'send_transform' && underlayUrl && (
                <TransformCanvas underlayUrl={underlayUrl} onDone={onTransformDone} softSeconds={60} />
            )}

            {showCanvas && nextAction === 'send_transform' && !underlayUrl && (
                <div className="rounded border bg-white p-4">No scribble found to use as underlay.</div>
            )}

            <div className="space-y-3">
                {loading && <div className="text-gray-600">Loading…</div>}

                {!loading && messages.length === 0 && (
                    <div className="rounded border bg-white p-4 text-gray-700">
                        No messages yet. Send the first scribble 🐸
                    </div>
                )}

                {messages.map((m) => (
                    <div key={m.id} className="rounded-2xl border bg-white p-3">
                        <div className="text-xs text-gray-500 mb-2">{m.type}</div>
                        {m.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.url} alt={m.type} className="w-full rounded-xl border" />
                        ) : (
                            <div className="text-sm text-gray-600">Image unavailable</div>
                        )}
                        {m.caption && <div className="mt-2 font-medium">{m.caption}</div>}
                    </div>
                ))}

                <RevealModal
                    open={revealOpen}
                    onClose={() => setRevealOpen(false)}
                    scribbleUrl={revealData?.scribbleUrl ?? ''}
                    transformUrl={revealData?.transformUrl ?? ''}
                    caption={revealData?.caption ?? null}
                    onSendBack={() => {
                        // open scribble canvas immediately
                        setShowCanvas(true)
                        // if you want: force next action to scribble during this interaction
                    }}
                />
            </div>
        </div>
    )
}