import { useRef } from 'react'

// Parent-owned gesture surface: WebKit blocks handlers in script-disabled book frames.
// Native pinch zoom remains available; links and text selection are not exposed in this mode.
export function ReaderGestures({
  onGesture,
  tapZones,
}: {
  onGesture: (gesture: 'next' | 'previous' | 'toggle') => void
  tapZones: 'horizontal' | 'vertical'
}) {
  const start = useRef<{ id: number; x: number; y: number; time: number } | null>(null)
  return (
    <div
      className="reader-touch-surface"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          start.current = null
          return
        }
        start.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        start.current = null
      }}
      onPointerUp={(event) => {
        const down = start.current
        start.current = null
        if (!down || down.id !== event.pointerId) return
        const dx = event.clientX - down.x,
          dy = event.clientY - down.y
        const elapsed = Date.now() - down.time
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 800)
          onGesture(dx < 0 ? 'next' : 'previous')
        else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && elapsed < 500) {
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio =
            tapZones === 'vertical'
              ? (event.clientY - rect.top) / rect.height
              : (event.clientX - rect.left) / rect.width
          onGesture(ratio < 0.28 ? 'previous' : ratio > 0.72 ? 'next' : 'toggle')
        }
      }}
    />
  )
}
