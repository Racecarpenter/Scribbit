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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowTransform(false)
    const t = setTimeout(() => setShowTransform(true), 500)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Reveal</div>
          <button className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="relative mt-3 overflow-hidden rounded-2xl border bg-white">
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
        </div>

        {caption ? <div className="mt-3 text-lg font-semibold">{caption}</div> : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button className="rounded-xl border px-3 py-2 hover:bg-gray-50">😂</button>
            <button className="rounded-xl border px-3 py-2 hover:bg-gray-50">🔥</button>
            <button className="rounded-xl border px-3 py-2 hover:bg-gray-50">💀</button>
          </div>

          <button
            className="rounded-xl bg-green-600 px-4 py-2 text-white"
            onClick={() => {
              onClose()
              onSendBack()
            }}
          >
            Send back
          </button>
        </div>
      </div>
    </div>
  )
}