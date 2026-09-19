import { useEffect, useRef, useState } from 'react'
import { Check, Cloud, Pencil, Trash2, X } from 'lucide-react'
import type { BookEdits, LibraryBook } from '../../domain/book'
import { BookCover } from './BookCover'
import { BookMetadataForm } from './BookMetadataForm'
import { RemoveBooksDialog, type RemoveMode } from './RemoveBooksDialog'
import { progressLabel } from './libraryView'

function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function BookDetails({
  book,
  onClose,
  onRemove,
  onRead,
  categories,
  seriesNames,
  cloudReady,
  onSave,
}: {
  book: LibraryBook
  categories: string[]
  seriesNames: string[]
  cloudReady: boolean
  onSave: (id: string, edits: BookEdits) => Promise<void>
  onClose: () => void
  onRemove: (mode: RemoveMode) => Promise<void>
  onRead: () => void
}) {
  const readable = book.format === 'epub' || book.format === 'txt'
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = saving
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [confirming])
  async function save(edits: BookEdits) {
    setSaving(true)
    setError(null)
    try {
      await onSave(book.id, edits)
      setEditing(false)
    } catch (cause) {
      setError(
        cause instanceof DOMException
          ? '無法儲存變更，請確認本機儲存空間後重試。'
          : cause instanceof Error
            ? cause.message
            : '無法儲存變更，請稍後重試。',
      )
    } finally {
      setSaving(false)
    }
  }
  if (confirming)
    return (
      <RemoveBooksDialog
        books={[book]}
        cloudReady={cloudReady}
        onClose={() => setConfirming(false)}
        onApply={async (mode) => {
          await onRemove(mode)
          onClose()
        }}
      />
    )
  return (
    <dialog
      ref={dialog}
      className={`install-dialog book-dialog${editing ? ' book-dialog-editing' : ''}`}
      aria-labelledby="book-title"
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="sheet-body">
        <div className="sheet-handle" />
        {!editing && (
          <div className="book-detail-tools">
            <button
              className="icon-button"
              aria-label="刪除書籍"
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={22} />
            </button>
            <button
              className="icon-button"
              aria-label="編輯書籍資訊"
              disabled={busy}
              onClick={() => {
                setEditing(true)
                setConfirming(false)
                setError(null)
              }}
            >
              <Pencil size={21} />
            </button>
          </div>
        )}
        <button
          className="icon-button close-dialog"
          aria-label="關閉書籍資訊"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        {!editing &&
          (readable ? (
            <button
              className="book-detail-cover book-detail-read"
              aria-label={book.downloaded === false ? '下載並閱讀' : '開始閱讀'}
              disabled={busy}
              onClick={onRead}
            >
              <BookCover book={book} />
              <span>{book.downloaded === false ? '點封面下載並閱讀' : '點封面開始閱讀'}</span>
            </button>
          ) : (
            <div className="book-detail-cover">
              <BookCover book={book} />
              <span>此格式尚未支援閱讀</span>
            </div>
          ))}
        <h2 id="book-title">{book.title}</h2>
        {editing ? (
          <BookMetadataForm
            book={book}
            categories={categories}
            seriesNames={seriesNames}
            saving={saving}
            onSave={save}
            onCancel={() => {
              setEditing(false)
              setError(null)
            }}
          />
        ) : (
          <>
            <p className="book-detail-author">
              {book.author || '未提供作者'}
              {book.series && (
                <>
                  {' · '}
                  {book.series}
                  {book.volume != null ? ' 第 ' + book.volume + ' 集' : ''}
                </>
              )}
            </p>
            <div className="book-detail-progress">
              <span
                className="book-detail-bar"
                role="img"
                aria-label={progressLabel(book)}
                aria-hidden={book.progress ? undefined : true}
              >
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, (book.progress?.percentage ?? 0) * 100))}%`,
                  }}
                />
              </span>
              <strong>{progressLabel(book)}</strong>
              {book.progress && (
                <time dateTime={new Date(book.progress.updatedAt).toISOString()}>
                  {new Intl.DateTimeFormat('zh-TW', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(book.progress.updatedAt)}
                </time>
              )}
            </div>
            <div className="book-facts">
              <span>{book.category || '未分類'}</span>
              <span>{book.format.toUpperCase()}</span>
              <span>
                {book.downloaded === false ? <Cloud size={14} /> : <Check size={14} />}
                {book.downloaded === false ? '僅在雲端' : '已存於本機'}
              </span>
              {book.cloudSource ? (
                <span>
                  <Cloud size={14} />
                  已備份
                </span>
              ) : (
                <span>尚未備份</span>
              )}
            </div>
            <details className="book-detail-more">
              <summary>原始檔案</summary>
              <p className="original-file">{book.fileName}</p>
              <p className="original-file">{formatFileSize(book.fileSize)}</p>
            </details>
          </>
        )}
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        {!editing && (
          <button className="secondary-button full-width book-back-button" onClick={onClose}>
            返回書架
          </button>
        )}
      </div>
    </dialog>
  )
}
