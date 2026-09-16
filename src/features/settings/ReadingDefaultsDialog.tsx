import { useState } from 'react'
import { TypographyPanel } from '../reader/TypographyPanel'
import { parseReadingSettings, type ReadingSettings } from '../reader/readingSettings'
import type { AppPreferences } from './preferences'

export function ReadingDefaultsDialog({
  preferences,
  onSave,
  onClose,
}: {
  preferences: AppPreferences
  onSave: (settings: ReadingSettings) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() =>
    parseReadingSettings(preferences.readingDefaults, preferences.theme),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSave(draft)
      onClose()
    } catch {
      setError('預設排版未能儲存，請確認本機空間後重試。')
      setBusy(false)
    }
  }
  return (
    <TypographyPanel
      settings={draft}
      onChange={setDraft}
      onClose={onClose}
      savingError={false}
      busy={busy}
      title="預設排版"
      preview
      note="EPUB／TXT 共用；已保存的單本排版不受影響。"
      footer={
        <div className="default-typography-footer">
          {error && (
            <p className="inline-warning" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button full-width" disabled={busy} onClick={() => void save()}>
            {busy ? '儲存中…' : '儲存預設排版'}
          </button>
        </div>
      }
    />
  )
}
