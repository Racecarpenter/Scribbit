'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Stroke = { color: string; points: Point[] }

export default function TransformCanvas(props: {
  underlayUrl: string
  onDone: (pngBlob: Blob, caption: string) => void
  softSeconds?: number
}) {
  const { underlayUrl, onDone, softSeconds = 60 } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const underlayImgRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [startTs, setStartTs] = useState<number | null>(null)
  const [caption, setCaption] = useState('')
  const [color, setColor] = useState('#111111')
  const [imgReady, setImgReady] = useState(false)

  const elapsed = useMemo(() => (startTs ? (Date.now() - startTs) / 1000 : 0), [startTs])
  const progress = Math.min(1, elapsed / softSeconds)

  const palette = ['#111111', '#2E7D32', '#1976D2', '#F9A825']

  // 1) Preload underlay image ONCE (or when URL changes)
  useEffect(() => {
    let cancelled = false
    setImgReady(false)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      underlayImgRef.current = img
      setImgReady(true)
      redraw(strokes) // draw immediately once ready
    }
    img.onerror = () => {
      if (cancelled) return
      underlayImgRef.current = null
      setImgReady(false)
      redraw(strokes)
    }
    img.src = underlayUrl

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlayUrl])

  // 2) Set canvas size on mount + resize only (not every stroke)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      redraw(strokes)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 3) Redraw function uses cached underlay image (NO await)
  const redraw = (nextStrokes: Stroke[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()

    // background
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // underlay (scribble)
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

    for (const s of nextStrokes) {
      if (s.points.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
    }
  }

  // 4) Schedule redraw (avoids 200 redraws/sec)
  const scheduleRedraw = (nextStrokes: Stroke[]) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => redraw(nextStrokes))
  }

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!startTs) setStartTs(Date.now())
    setIsDrawing(true)
    const p = getPos(e)

    setStrokes((prev) => {
      const next = [...prev, { color, points: [p] }]
      scheduleRedraw(next)
      return next
    })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const p = getPos(e)

    setStrokes((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, points: [...last.points, p] }
      scheduleRedraw(next)
      return next
    })
  }

  const endStroke = () => setIsDrawing(false)

  const undo = () => {
    setStrokes((prev) => {
      const next = prev.slice(0, -1)
      scheduleRedraw(next)
      return next
    })
  }

  const clear = () => {
    setStrokes([])
    setStartTs(null)
    scheduleRedraw([])
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

    for (const s of strokes) {
      if (s.points.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), 'image/png', 1.0)
    )
    if (!blob) throw new Error('Failed to export PNG')

    onDone(blob, caption.trim())
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Transform</div>

        <div className="flex items-center gap-2">
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

      <div className="flex items-center gap-2">
        {palette.map((p) => (
          <button
            key={p}
            onClick={() => setColor(p)}
            className={`h-8 w-8 rounded-full border ${color === p ? 'ring-2 ring-green-600' : ''}`}
            style={{ background: p }}
            aria-label="color"
          />
        ))}
        <div className="text-sm text-gray-600 ml-2">
          {imgReady ? 'Underlay loaded' : 'Loading underlay…'}
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

      <input
        className="w-full rounded-xl border p-3"
        placeholder="Caption (optional)"
        maxLength={60}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />

      {progress >= 1 && <div className="text-sm text-gray-600">Time’s up… or keep going 😏</div>}
    </div>
  )
}