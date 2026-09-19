import { useRef } from 'react'

const TAP_SLOP = 12
const DRAG_SLOP = 8

// Parent-owned gesture surface: WebKit blocks handlers in script-disabled book frames.
// Native pinch zoom remains available; links and text selection are not exposed in this mode.
export function ReaderGestures({
  onGesture,
  onDragMove,
  onDragEnd,
  tapZones,
}: {
  onGesture: (gesture: 'next' | 'previous' | 'toggle') => void
  // Both are set together; without them a swipe simply turns the page on release.
  onDragMove?: (dx: number) => void
  onDragEnd?: (dx: number, width: number) => void
  tapZones: 'horizontal' | 'vertical'
}) {
  const start = useRef<{ id: number; x: number; y: number; time: number } | null>(null)
  const dragging = useRef(false)
  function reset() {
    if (dragging.current) onDragMove?.(0)
    dragging.current = false
    start.current = null
  }
  return (
    <div
      className="reader-touch-surface"
      aria-hidden="true"
      onPointerDown={(event) => {
        // A second finger means pinch zoom, not a page turn.
        if (!event.isPrimary || event.button !== 0 || start.current) {
          reset()
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
      onPointerMove={(event) => {
        const down = start.current
        if (!down || down.id !== event.pointerId || !onDragMove) return
        const dx = event.clientX - down.x,
          dy = event.clientY - down.y
        if (!dragging.current) {
          if (Math.abs(dx) < DRAG_SLOP || Math.abs(dx) <= Math.abs(dy)) return
          dragging.current = true
        }
        onDragMove(dx)
      }}
      onPointerCancel={reset}
      onPointerUp={(event) => {
        const down = start.current
        const dragged = dragging.current
        start.current = null
        dragging.current = false
        if (!down || down.id !== event.pointerId) {
          if (dragged) onDragMove?.(0)
          return
        }
        const dx = event.clientX - down.x,
          dy = event.clientY - down.y
        const elapsed = Date.now() - down.time
        if (dragged) {
          onDragEnd?.(dx, event.currentTarget.getBoundingClientRect().width)
          return
        }
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 800)
          onGesture(dx < 0 ? 'next' : 'previous')
        else if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && elapsed < 500) {
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
