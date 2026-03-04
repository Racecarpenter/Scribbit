'use client'

export default function RevealModal(props: Readonly<{
  open: boolean
  onClose: () => void
  scribbleUrl: string
  transformUrl: string
  caption?: string | null
  onSendBack: () => void
}>) {
  const { open, onClose, scribbleUrl, transformUrl, caption, onSendBack } = props

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
            className="absolute inset-0 h-full w-full object-cover opacity-100 animate-[scribbitFadeOut_0.5s_ease_0.5s_forwards]"
          />
          {/* transform */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={transformUrl}
            alt="transform"
            className="h-[420px] w-full object-cover opacity-0 animate-[scribbitFadeIn_0.7s_ease_0.5s_forwards]"
          />
        </div>

        {/* local keyframes */}
        <style jsx>{`
          @keyframes scribbitFadeOut {
            to {
              opacity: 0;
            }
          }
          @keyframes scribbitFadeIn {
            to {
              opacity: 1;
            }
          }
        `}</style>

        {caption ? <div className="mt-3 text-lg font-semibold">{caption}</div> : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button className="rounded-xl border px-3 py-2 hover:bg-gray-50" type="button">
              😂
            </button>
            <button className="rounded-xl border px-3 py-2 hover:bg-gray-50" type="button">
              🔥
            </button>
            <button className="rounded-xl border px-3 py-2 hover:bg-gray-50" type="button">
              💀
            </button>
          </div>

          <button
            className="rounded-xl bg-green-600 px-4 py-2 text-white"
            type="button"
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