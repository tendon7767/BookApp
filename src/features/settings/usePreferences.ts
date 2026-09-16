import { useEffect, useState } from 'react'
import { readPreferences, writePreferences } from '../../storage/database'
import type { ReadingSettings } from '../reader/readingSettings'
import { defaultPreferences, type Theme } from './preferences'

export function usePreferences() {
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  useEffect(() => {
    let mounted = true
    void readPreferences()
      .then((value) => {
        if (mounted) setPreferences(value)
      })
      .catch(() => {
        if (mounted) setStorageError('無法讀取本機設定。你仍可調整外觀，但設定可能無法保存。')
      })
      .finally(() => {
        if (mounted) setReady(true)
      })
    return () => {
      mounted = false
    }
  }, [])
  useEffect(() => {
    const reload = () => {
      void readPreferences()
        .then(setPreferences)
        .catch(() => setStorageError('無法讀取還原後的設定。'))
    }
    window.addEventListener('kanshu-restored', reload)
    return () => window.removeEventListener('kanshu-restored', reload)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    const colors = {
      paper: '#f6f3ec',
      light: '#fafbfc',
      dark: '#191e1b',
      graphite: '#202124',
      mist: '#edf3f8',
      sage: '#edf2e9',
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', colors[preferences.theme])
  }, [preferences.theme])

  async function setTheme(theme: Theme) {
    if (!ready || saving) return
    const next = { ...preferences, theme }
    setPreferences(next)
    setSaving(true)
    try {
      await writePreferences(next)
      setStorageError(null)
    } catch {
      setStorageError('外觀已套用，但未能保存。請確認裝置有足夠空間，再點選外觀重試。')
    } finally {
      setSaving(false)
    }
  }
  async function setReadingDefaults(readingDefaults: ReadingSettings) {
    if (!ready || saving) throw new Error('設定尚未準備完成，請稍後重試。')
    const next = { ...preferences, readingDefaults }
    setSaving(true)
    try {
      await writePreferences(next)
      setPreferences(next)
      setStorageError(null)
    } finally {
      setSaving(false)
    }
  }
  return { preferences, ready, saving, storageError, setTheme, setReadingDefaults }
}
