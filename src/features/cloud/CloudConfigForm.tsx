import { useState } from 'react'
import type { DriveConfig } from './types'

export function CloudConfigForm({
  config,
  disabled,
  onSave,
}: {
  config?: DriveConfig
  disabled: boolean
  onSave: (value: DriveConfig) => Promise<void>
}) {
  const [draft, setDraft] = useState(config ?? { clientId: '', apiKey: '', appId: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return (
    <details className="cloud-config" open={!config || undefined}>
      <summary>Google 應用程式設定</summary>
      <p className="quiet-note">網站管理者只需設定一次。填公開的前端設定，不需要 Client Secret。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setMessage('')
          void onSave(draft)
            .then(() => setMessage('設定已儲存。'))
            .catch((cause: unknown) => {
              setMessage(cause instanceof Error ? cause.message : '設定未能保存，請重試。')
            })
            .finally(() => setBusy(false))
        }}
      >
        {(
          [
            ['clientId', 'OAuth Client ID', 'xxxx.apps.googleusercontent.com'],
            ['apiKey', 'Picker API Key', 'AIza…'],
            ['appId', '專案編號', '數字形式的 Project number'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <input
              value={draft[key]}
              placeholder={placeholder}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={disabled || busy}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
        <button className="secondary-button" disabled={disabled || busy}>
          {busy ? '儲存中…' : '儲存 Google 設定'}
        </button>
        {message && (
          <p role="status" className="quiet-note">
            {message}
          </p>
        )}
      </form>
    </details>
  )
}
