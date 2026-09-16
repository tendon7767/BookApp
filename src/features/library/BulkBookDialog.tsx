import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'

export function BulkBookDialog({
  kind,
  books,
  categories,
  onApply,
  onClose,
}: {
  kind: 'category' | 'remove'
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
        <h2 id="bulk-title">{kind === 'category' ? '批次分類' : '刪除所選書籍'}</h2>
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
          {kind === 'category' ? (
            <>
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
            </>
          ) : (
            <p className="quiet-note">
              將從書架刪除所選書籍、閱讀進度與排版設定。若已啟用雲端同步，其他裝置也會同步刪除；已同步的書籍可在雲端設定中找回。自行保留的原始檔案不受影響。
            </p>
          )}
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
              type="submit"
              className={kind === 'remove' ? 'danger-button' : 'primary-button'}
              disabled={busy}
            >
              {busy ? '處理中…' : kind === 'category' ? '套用分類' : `確認刪除 ${books.length} 本`}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
