'use client'

import React, { useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Stroke = Point[]

export default function ScribbleCanvas(props: {
  onDone: (pngBlob: Blob) => void
  softSeconds?: number
}) {
  const { onDone, softSeconds = 60 } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [startTs, setStartTs] = useState<number | null>(null)

  const elapsed = useMemo(() => (startTs ? (Date.now() - startTs) / 1000 : 0), [startTs])
  const progress = Math.min(1, elapsed / softSeconds)

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const redraw = (nextStrokes: Stroke[]) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // fit to displayed size
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // ink
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of nextStrokes) {
      if (s.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(s[0].x, s[0].y)
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y)
      ctx.stroke()
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!startTs) setStartTs(Date.now())
    setIsDrawing(true)
    const p = getPos(e)

    setStrokes((prev) => {
      const next = [...prev, [p]]
      requestAnimationFrame(() => redraw(next))
      return next
    })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const p = getPos(e)

    setStrokes((prev) => {
      const next = [...prev]
      next[next.length - 1] = [...next[next.length - 1], p]
      requestAnimationFrame(() => redraw(next))
      return next
    })
  }

  const endStroke = () => setIsDrawing(false)

  const undo = () => {
    setStrokes((prev) => {
      const next = prev.slice(0, -1)
      requestAnimationFrame(() => redraw(next))
      return next
    })
  }

  const clear = () => {
    setStrokes([])
    setStartTs(null)
    requestAnimationFrame(() => redraw([]))
  }

  const exportPng = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Export a clean PNG from current strokes (independent of DPR)
    const rect = canvas.getBoundingClientRect()
    const out = document.createElement('canvas')
    out.width = Math.floor(rect.width)
    out.height = Math.floor(rect.height)

    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)

    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of strokes) {
      if (s.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(s[0].x, s[0].y)
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y)
      ctx.stroke()
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), 'image/png', 1.0)
    )
    if (!blob) throw new Error('Failed to export PNG')
    onDone(blob)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">New Scribble</div>

        <div className="flex items-center gap-2">
          {/* soft timer ring */}
          <div
            className="h-7 w-7 rounded-full border"
            style={{
              background: `conic-gradient(rgba(0,0,0,0.35) ${progress * 360}deg, rgba(0,0,0,0.06) 0deg)`,
            }}
            title="Soft timer"
          />
          <button className="rounded border px-3 py-1" onClick={undo} disabled={!strokes.length}>
            Undo
          </button>
          <button className="rounded border px-3 py-1" onClick={clear} disabled={!strokes.length}>
            Clear
          </button>
          <button className="rounded bg-green-600 px-3 py-1 text-white" onClick={exportPng} disabled={!strokes.length}>
            Done
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <canvas
          ref={canvasRef}
          className="block h-[460px] w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>

      {progress >= 1 && (
        <div className="text-sm text-gray-600">Time’s up… or keep going 😏</div>
      )}
    </div>
  )
}