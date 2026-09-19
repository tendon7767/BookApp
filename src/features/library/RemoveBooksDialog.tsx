import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'
import { useBackLayer } from '../../platform/useBackLayer'

export type RemoveMode = 'download' | 'shelf' | 'cloud'

export function RemoveBooksDialog({
  books,
  cloudReady,
  onApply,
  onClose,
}: {
  books: LibraryBook[]
  cloudReady: boolean
  onApply: (mode: RemoveMode) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<RemoveMode>('shelf')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useBackLayer(true, onClose, busy)
  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])
  const downloaded = books.filter((b) => b.downloaded !== false && b.cloudSource)
  const backed = books.filter((b) => b.cloudSource)
  const options: { id: RemoveMode; label: string; note: string; disabled?: string }[] = [
    {
      id: 'download',
      label: '只移除本機下載',
      note: '書架、閱讀進度、排版與雲端原檔都保留，需要時可再下載。',
      disabled: downloaded.length ? undefined : '所選書籍沒有已下載且已備份的原檔。',
    },
    {
      id: 'shelf',
      label: '從書架移除',
      note: '本機書籍、進度與排版會刪除，其他裝置同步移除；雲端原檔保留，可在雲端設定中找回。',
    },
    {
      id: 'cloud',
      label: '連雲端原檔一起刪除',
      note: '除了從書架移除，Drive 上的原檔與封面會移到 Google Drive 垃圾桶，可在 Drive 內復原。',
      disabled: !backed.length
        ? '所選書籍尚未備份到雲端。'
        : cloudReady
          ? undefined
          : '請先到「設定 → 雲端同步」連接 Google Drive。',
    },
  ]
  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onApply(mode)
      onClose()
    } catch (cause) {
      setError(
        cause instanceof DOMException
          ? '未能儲存變更，請確認本機空間後重試。'
          : cause instanceof Error
            ? cause.message
            : '操作失敗，請重試。',
      )
      setBusy(false)
    }
  }
  const affected = mode === 'download' ? downloaded.length : books.length
  return (
    <dialog
      ref={dialog}
      className="install-dialog bulk-dialog"
      aria-labelledby="remove-title"
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
          aria-label="關閉刪除選項"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <h2 id="remove-title">刪除書籍</h2>
        <p>已選 {books.length} 本書</p>
        <ul className="bulk-book-list">
          {books.map((b) => (
            <li key={b.id}>{b.title}</li>
          ))}
        </ul>
        <div className="remove-options" role="radiogroup" aria-label="刪除範圍">
          {options.map((option) => (
            <label
              key={option.id}
              className={`remove-option${option.disabled ? ' is-disabled' : ''}`}
            >
              <input
                type="radio"
                name="remove-mode"
                value={option.id}
                checked={mode === option.id}
                disabled={busy || !!option.disabled}
                onChange={() => setMode(option.id)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.disabled ?? option.note}</small>
              </span>
            </label>
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
          <button
            type="button"
            className="danger-button"
            disabled={busy || !affected}
            onClick={() => void submit()}
          >
            {busy
              ? '處理中…'
              : mode === 'download'
                ? `移除 ${affected} 本的下載`
                : `確認刪除 ${affected} 本`}
          </button>
        </div>
        <p className="quiet-note">你自行保留的原始檔案不受影響。</p>
      </div>
    </dialog>
  )
}
