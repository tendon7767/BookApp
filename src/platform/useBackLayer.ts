import { useEffect, useRef } from 'react'
import { appHistorySettled, appLayers, leaveAppLayer, pushAppLayer } from './appHistory'

let nextToken = 0

/** Give an open sheet or editing mode one browser Back step. */
export function useBackLayer(open: boolean, onBack: () => void, blocked = false) {
  const onBackRef = useRef(onBack)
  const blockedRef = useRef(blocked)
  useEffect(() => {
    onBackRef.current = onBack
    blockedRef.current = blocked
  })

  useEffect(() => {
    if (!open) return
    const token = `layer-${++nextToken}`
    let active = true
    let pushed = false
    const onPopState = () => {
      if (!pushed || appLayers().includes(token)) return
      if (blockedRef.current) pushAppLayer(token)
      else onBackRef.current()
    }
    window.addEventListener('popstate', onPopState)
    // Strict Mode can mount, clean up, and mount again before this microtask.
    void appHistorySettled().then(() => {
      if (!active) return
      pushAppLayer(token)
      pushed = true
    })
    return () => {
      active = false
      window.removeEventListener('popstate', onPopState)
      if (pushed) leaveAppLayer(token)
    }
  }, [open])
}
