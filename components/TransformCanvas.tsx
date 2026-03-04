'use client'

import React, { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Stroke = { color: string; points: Point[] }

type UnderlayStatus = 'loading' | 'ready' | 'error'

export default function TransformCanvas(props: Readonly<{
  underlayUrl: string
  onDone: (pngBlob: Blob, caption: string) => void
}>) {
  const { underlayUrl, onDone } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const underlayImgRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // strokes in refs (no rerender per move)
  const strokesRef = useRef<Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [strokesCount, setStrokesCount] = useState(0)

  const [caption, setCaption] = useState('')
  const [color, setColor] = useState('#0E2B24')

  // ✅ for UI rendering (no refs accessed during render)
  const [underlayStatus, setUnderlayStatus] = useState<UnderlayStatus>('loading')
  const [loadedUnderlayUrl, setLoadedUnderlayUrl] = useState<string | null>(null)

  const palette = ['#0E2B24', '#2E7D32', '#0B73E5', '#F2B233']

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

    // background
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // underlay
    const img = underlayImgRef.current
    if (img) {
      ctx.globalAlpha = 0.18
      ctx.drawImage(img, 0, 0, rect.width, rect.height)
      ctx.globalAlpha = 1
    }

    // strokes
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of strokesRef.current) {
      if (s.points.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
    }
  }

  const scheduleRedraw = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => redraw())
  }

  // canvas sizing
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

  // underlay preload
  useEffect(() => {
    let cancelled = false

    underlayImgRef.current = null

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (cancelled) return
      underlayImgRef.current = img
      setLoadedUnderlayUrl(underlayUrl)
      setUnderlayStatus('ready')
      redraw()
    }

    img.onerror = () => {
      if (cancelled) return
      underlayImgRef.current = null
      setLoadedUnderlayUrl(null)
      setUnderlayStatus('error')
      redraw()
    }

    img.src = underlayUrl

    return () => {
      cancelled = true
    }
  }, [underlayUrl])

  // ✅ derive "loading" without any state update in effect
  const loadedUnder = loadedUnderlayUrl === underlayUrl ? 'ready' : 'loading'
  const derivedStatus: UnderlayStatus = underlayStatus === 'error' ? 'error' : loadedUnder

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDrawing(true)

    const p = getPos(e)
    const stroke: Stroke = { color, points: [p] }
    activeStrokeRef.current = stroke
    strokesRef.current.push(stroke)
    setStrokesCount(strokesRef.current.length)
    scheduleRedraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const stroke = activeStrokeRef.current
    if (!stroke) return
    stroke.points.push(getPos(e))
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
    scheduleRedraw()
  }

  const exportPng = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const out = document.createElement('canvas')
    out.width = Math.floor(rect.width)
    out.height = Math.floor(rect.height)

    const ctx = out.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)

    const img = underlayImgRef.current
    if (img) {
      ctx.globalAlpha = 0.18
      ctx.drawImage(img, 0, 0, out.width, out.height)
      ctx.globalAlpha = 1
    }

    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of strokesRef.current) {
      if (s.points.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
    }

    const blob = await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), 'image/png', 1.0))
    if (!blob) throw new Error('Failed to export PNG')

    onDone(blob, caption.trim())
  }

  const canDone = strokesCount > 0
  const isReady = derivedStatus === 'ready'
  const statusText = isReady ? 'Underlay loaded' : derivedStatus === 'error' ? 'Underlay failed' : 'Loading underlay…'

  // while drawing: avoid mis-taps
  const disableActions = isDrawing

  return (
    <div className="space-y-4 text-[#0E2B24]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-extrabold tracking-tight">Transform</div>
          <div className="text-sm text-[#0E2B24]/60">Trace the underlay and add your twist.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-2xl bg-white/60 px-3 py-2 text-sm font-semibold ring-1 ring-black/10 hover:bg-white transition disabled:opacity-50"
            onClick={undo}
            disabled={!canDone || disableActions}
            type="button"
          >
            Undo
          </button>

          <button
            className="rounded-2xl bg-white/60 px-3 py-2 text-sm font-semibold ring-1 ring-black/10 hover:bg-white transition disabled:opacity-50"
            onClick={clear}
            disabled={!canDone || disableActions}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {palette.map((p) => {
            const selected = color === p
            return (
              <button
                key={p}
                onClick={() => setColor(p)}
                className={[
                  'h-9 w-9 rounded-2xl ring-1 ring-black/10 shadow-sm transition',
                  'hover:scale-[1.02] active:scale-[0.98]',
                  selected ? 'ring-2 ring-[#8CE13C]/60' : '',
                ].join(' ')}
                style={{ background: p }}
                aria-label="color"
                type="button"
                disabled={disableActions}
              />
            )
          })}
        </div>

        <span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold bg-white/60 ring-1 ring-black/10">
          <span className={`h-2 w-2 rounded-full ${isReady ? 'bg-[#8CE13C]' : 'bg-[#0B73E5]'}`} />
          <span className="text-[#0E2B24]/70">{statusText}</span>
        </span>
      </div>

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

      {/* Caption + Done */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Caption (optional)</div>

          <button
            className="rounded-2xl px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50
                       bg-[linear-gradient(90deg,#0B73E5_0%,#19C9C3_55%,#8CE13C_110%)]
                       shadow-sm shadow-black/10 active:scale-[0.99] transition"
            onClick={exportPng}
            disabled={!canDone || disableActions}
            type="button"
            title={disableActions ? 'Finish your stroke first' : undefined}
          >
            Done
          </button>
        </div>

        <input
          className="w-full rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-[#8CE13C]/60"
          placeholder="Give it a name…"
          maxLength={60}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <div className="text-xs text-[#0E2B24]/45">{caption.trim().length}/60</div>
      </div>
    </div>
  )
}