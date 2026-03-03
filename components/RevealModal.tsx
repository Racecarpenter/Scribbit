'use client'

import { useEffect, useState } from 'react'

export default function RevealModal(props: Readonly<{
  open: boolean
  onClose: () => void
  scribbleUrl: string
  transformUrl: string
  caption?: string | null
  onSendBack: () => void
}>) {
  const { open, onClose, scribbleUrl, transformUrl, caption, onSendBack } = props
  const [showTransform, setShowTransform] = useState(false)

  useEffect(() => {
    if (!open) return
    setShowTransform(false)
    const t = setTimeout(() => setShowTransform(true), 500)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-3xl bg-[#F6F4EF] text-[#0E2B24]
                      ring-1 ring-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden">
        {/* Subtle top glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[520px] -translate-x-1/2 blur-3xl
                        bg-[radial-gradient(circle_at_top,#8CE13C22,transparent_60%)]" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/70 ring-1 ring-black/10 shadow-sm grid place-items-center">
              <span className="text-xl">🐸</span>
            </div>
            <div className="leading-tight">
              <div className="text-base font-extrabold tracking-tight">Reveal</div>
              <div className="text-xs text-[#0E2B24]/60">scribble → transform</div>
            </div>
          </div>

          <button
            className="rounded-2xl px-3 py-2 text-sm font-semibold text-[#0E2B24]/70
                       hover:bg-white/60 ring-1 ring-black/10 bg-white/40 transition"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Media */}
        <div className="relative px-5 pb-4 pt-4">
          <div className="relative overflow-hidden rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm">
            {/* scribble */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scribbleUrl}
              alt="scribble"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                showTransform ? 'opacity-0' : 'opacity-100'
              }`}
            />
            {/* transform */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={transformUrl}
              alt="transform"
              className={`h-[420px] w-full object-cover transition-opacity duration-700 ${
                showTransform ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Corner badge */}
            <div className="absolute left-3 top-3 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold
                            ring-1 ring-black/10 backdrop-blur">
              {showTransform ? 'You just now' : 'Incoming'}
            </div>
          </div>

          {caption ? (
            <div className="mt-4 rounded-3xl bg-white/70 ring-1 ring-black/10 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold text-[#0E2B24]/60">Caption</div>
              <div className="mt-1 text-lg font-extrabold tracking-tight">{caption}</div>
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {['😂', '🔥', '💀'].map((emoji) => (
                <button
                  key={emoji}
                  className="rounded-2xl bg-white/60 px-3 py-2 text-lg
                             ring-1 ring-black/10 hover:bg-white transition"
                  // later: wire to reactions persistence
                  onClick={() => {}}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <button
              className="rounded-2xl px-5 py-3 text-sm font-extrabold text-white
                         bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                         shadow-sm shadow-black/10 active:scale-[0.99] transition"
              onClick={() => {
                onClose()
                onSendBack()
              }}
              type="button"
            >
              Send back
            </button>
          </div>

          <div className="mt-3 text-xs text-[#0E2B24]/50">
            Tip: reactions are UI-only for now (we’ll persist them in step C).
          </div>
        </div>
      </div>
    </div>
  )
}