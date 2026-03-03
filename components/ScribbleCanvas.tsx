'use client'

import React, { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Stroke = Point[]

export default function ScribbleCanvas(props: Readonly<{
  onDone: (pngBlob: Blob) => void
  softSeconds?: number
}>) {
  const { onDone, softSeconds = 60 } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // ✅ strokes live in a ref (no re-render per move)
  const strokesRef = useRef<Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [strokesCount, setStrokesCount] = useState(0)

  const [startTs, setStartTs] = useState<number | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())

  // timer tick only after start
  useEffect(() => {
    if (!startTs) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [startTs])

  const elapsed = startTs ? (now - startTs) / 1000 : 0
  const progress = Math.min(1, elapsed / softSeconds)

  const resizeCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()

    // background (pure white)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // ink
    ctx.strokeStyle = '#0E2B24'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of strokesRef.current) {
      if (s.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(s[0].x, s[0].y)
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y)
      ctx.stroke()
    }
  }

  const scheduleRedraw = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => redraw())
  }

  // size once + on resize/orientation
  useEffect(() => {
    resizeCanvas()
    redraw()

    const onResize = () => {
      resizeCanvas()
      redraw()
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!startTs) setStartTs(Date.now())
    setIsDrawing(true)

    const p = getPos(e)
    const stroke: Stroke = [p]
    activeStrokeRef.current = stroke
    strokesRef.current.push(stroke)

    setStrokesCount(strokesRef.current.length)
    scheduleRedraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const stroke = activeStrokeRef.current
    if (!stroke) return

    const p = getPos(e)
    stroke.push(p)
    scheduleRedraw()
  }

  const endStroke = () => {
    setIsDrawing(false)
    activeStrokeRef.current = null
  }

  const undo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1)
    activeStrokeRef.current = null
    setStrokesCount(strokesRef.current.length)
    scheduleRedraw()
  }

  const clear = () => {
    strokesRef.current = []
    activeStrokeRef.current = null
    setStrokesCount(0)
    setStartTs(null)
    scheduleRedraw()
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

    ctx.strokeStyle = '#0E2B24'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of strokesRef.current) {
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

  const ringStyle: React.CSSProperties = {
    background: `conic-gradient(
      #0B73E5 0deg,
      #19C9C3 ${Math.min(progress, 0.55) * 360}deg,
      #8CE13C ${progress * 360}deg,
      rgba(14,43,36,0.10) 0deg
    )`,
  }

  const canDone = strokesCount > 0

  return (
    <div className="space-y-4 text-[#0E2B24]">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-extrabold tracking-tight">New Scribble</div>
          <div className="text-sm text-[#0E2B24]/60">Draw anything. Keep it simple.</div>
        </div>

        <div className="flex items-center gap-2">
          {/* Timer chip */}
          <div
            className="h-9 w-9 rounded-2xl p-[2px] ring-1 ring-black/10 bg-white/60 shadow-sm"
            title="Soft timer"
          >
            <div className="h-full w-full rounded-[14px] p-[2px]" style={ringStyle}>
              <div className="h-full w-full rounded-[12px] bg-[#F6F4EF]" />
            </div>
          </div>

          <button
            className="rounded-2xl bg-white/60 px-3 py-2 text-sm font-semibold
                       ring-1 ring-black/10 hover:bg-white transition disabled:opacity-50"
            onClick={undo}
            disabled={!canDone}
            type="button"
          >
            Undo
          </button>

          <button
            className="rounded-2xl bg-white/60 px-3 py-2 text-sm font-semibold
                       ring-1 ring-black/10 hover:bg-white transition disabled:opacity-50"
            onClick={clear}
            disabled={!canDone}
            type="button"
          >
            Clear
          </button>

          <button
            className="rounded-2xl px-4 py-2 text-sm font-extrabold text-white
                       disabled:opacity-50
                       bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                       shadow-sm shadow-black/10 active:scale-[0.99] transition"
            onClick={exportPng}
            disabled={!canDone}
            type="button"
          >
            Done
          </button>
        </div>
      </div>

      {/* Canvas card */}
      <div className="overflow-hidden rounded-3xl bg-white/70 ring-1 ring-black/10 shadow-sm">
        <canvas
          ref={canvasRef}
          className="block h-[460px] w-full touch-none bg-white"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          onPointerOut={endStroke}
        />
      </div>

      {progress >= 1 && (
        <div className="text-sm text-[#0E2B24]/60">
          Time’s up… or keep going 😏
        </div>
      )}
    </div>
  )
}