import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'
import type { SeriesAssignment } from '../../domain/series'
import { SeriesFields, VolumeField } from './SeriesFields'
import { suggestSeries } from './seriesSuggestions'

export function SeriesDialog({
  books,
  names,
  onApply,
  onClose,
}: {
  books: LibraryBook[]
  names: string[]
  onApply: (name: string, entries: SeriesAssignment[]) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [suggestions] = useState(() => suggestSeries(books))
  const [name, setName] = useState(suggestions.name)
  const [volumes, setVolumes] = useState(suggestions.volumes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])
  async function submit() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onApply(
        name,
        books.map((b) => ({ id: b.id, volume: volumes[b.id] ? Number(volumes[b.id]) : null })),
      )
      onClose()
    } catch (cause) {
      setError(
        cause instanceof DOMException
          ? '未能儲存變更，請確認本機空間後重試。'
          : cause instanceof Error
            ? cause.message
            : '無法儲存，請重試。',
      )
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="install-dialog bulk-dialog"
      aria-labelledby="series-dialog-title"
      onCancel={(e) => {
        if (busy) e.preventDefault()
        else onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="sheet-body">
        <button
          className="icon-button close-dialog"
          aria-label="關閉系列設定"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <h2 id="series-dialog-title">設定系列 · {books.length} 本</h2>
        <form
          className="book-edit-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <SeriesFields
            name={name}
            onName={setName}
            names={names}
            disabled={busy}
            listId="bulk-series-names"
          />
          <p className="quiet-note">
            {suggestions.suggested && '已依書名共通文字與數字預填，請確認後套用。'}
            {!suggestions.name && '未能辨識共同系列，請填入系列名稱。'}
            集數可填小數；番外可留白，會排在最後。系列留白會將所選書籍移出系列。
          </p>
          <div className="series-volume-list">
            {books.map((b) => (
              <VolumeField
                key={b.id}
                label={`${b.title} 集數`}
                value={volumes[b.id]}
                onChange={(v) => setVolumes((prev) => ({ ...prev, [b.id]: v }))}
                disabled={busy || !name.trim()}
              />
            ))}
          </div>
          {error && (
            <p className="inline-warning" role="alert">
              {error}
            </p>
          )}
          <div className="confirmation-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? '儲存中…' : '套用系列'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
