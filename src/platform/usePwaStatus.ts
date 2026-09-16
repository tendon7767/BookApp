import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

type OfflineState = 'unsupported' | 'development' | 'error' | 'ready' | 'preparing'

export function usePwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [standalone, setStandalone] = useState(
    matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )
  const [cached, setCached] = useState(false)
  const [registrationError, setRegistrationError] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState(false)
  const supported = 'serviceWorker' in navigator && window.isSecureContext
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      setRegistrationError(true)
    },
  })

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    const displayMode = matchMedia('(display-mode: standalone)')
    const onDisplayChange = () =>
      setStandalone(
        displayMode.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      )
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    displayMode.addEventListener('change', onDisplayChange)
    return () => {
      window.removeEventListener('online', connected)
      window.removeEventListener('offline', disconnected)
      displayMode.removeEventListener('change', onDisplayChange)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    if (import.meta.env.PROD && supported && 'caches' in window) {
      void navigator.serviceWorker.ready
        .then(async (registration) => {
          const shell = new URL(`${import.meta.env.BASE_URL}index.html`, location.origin)
          const response = await caches.match(shell.href, { ignoreSearch: true })
          if (mounted && registration.active && response) setCached(true)
        })
        .catch(() => {
          if (mounted) setRegistrationError(true)
        })
    }
    return () => {
      mounted = false
    }
  }, [supported])

  async function applyUpdate() {
    setUpdating(true)
    setUpdateError(false)
    try {
      await updateServiceWorker(true)
    } catch {
      setUpdateError(true)
    } finally {
      setUpdating(false)
    }
  }
  const offlineState: OfflineState = !supported
    ? 'unsupported'
    : import.meta.env.DEV
      ? 'development'
      : registrationError
        ? 'error'
        : cached
          ? 'ready'
          : 'preparing'
  return {
    online,
    standalone,
    offlineState,
    needRefresh,
    updating,
    updateError,
    applyUpdate,
    dismissUpdate: () => setNeedRefresh(false),
  }
}
export type PwaStatus = ReturnType<typeof usePwaStatus>
