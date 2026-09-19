import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'

export function BulkBookDialog({
  books,
  categories,
  onApply,
  onClose,
}: {
  books: LibraryBook[]
  categories: string[]
  onApply: (category: string) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])
  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onApply(category)
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
  return (
    <dialog
      ref={dialog}
      className="install-dialog bulk-dialog"
      aria-labelledby="bulk-title"
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
          aria-label="關閉批次編輯"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <h2 id="bulk-title">批次分類</h2>
        <p>已選 {books.length} 本書</p>
        <ul className="bulk-book-list">
          {books.map((b) => (
            <li key={b.id}>{b.title}</li>
          ))}
        </ul>
        <form
          className="book-edit-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>
            分類
            <input
              autoFocus
              maxLength={60}
              list="bulk-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="輸入或選擇分類"
              disabled={busy}
            />
          </label>
          <datalist id="bulk-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="quiet-note">留白會將所選書籍設為未分類。</p>
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
              {busy ? '處理中…' : '套用分類'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
