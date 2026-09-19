import { useEffect, useRef, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
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
          <button
            className="icon-button delete-book-icon"
            aria-label="刪除書籍"
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={22} />
          </button>
        )}
        <button
          className="icon-button close-dialog"
          aria-label="關閉書籍資訊"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        {!editing && (
          <div className="book-detail-cover">
            <BookCover book={book} />
          </div>
        )}
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
            <p>{book.author || '未提供作者'}</p>
            {book.series && (
              <p>
                {book.series}
                {book.volume != null ? ' · 第 ' + book.volume + ' 集' : ''}
              </p>
            )}
            <p className="book-reading-status">
              {book.category || '未分類'} · {progressLabel(book)}
              {book.progress && (
                <>
                  <br />
                  <time dateTime={new Date(book.progress.updatedAt).toISOString()}>
                    上次閱讀：
                    {new Intl.DateTimeFormat('zh-TW', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(book.progress.updatedAt)}
                  </time>
                </>
              )}
            </p>
            <div className="book-facts">
              <span>{book.format.toUpperCase()}</span>
              <span>{formatFileSize(book.fileSize)}</span>
              <span>
                <Check size={14} />{' '}
                {book.downloaded === false ? '雲端書籍 · 尚未下載' : '已存於本機'}
              </span>
            </div>
            <p className="original-file">原始檔案：{book.fileName}</p>
            <button
              className="secondary-button full-width edit-book-button"
              disabled={busy}
              onClick={() => {
                setEditing(true)
                setConfirming(false)
                setError(null)
              }}
            >
              編輯書籍資訊
            </button>
            {book.format === 'epub' || book.format === 'txt' ? (
              <button className="primary-button full-width" disabled={busy} onClick={onRead}>
                {book.downloaded === false ? '下載並閱讀' : '開始閱讀'}
              </button>
            ) : (
              <p className="book-stage-note">書籍已保存，此格式尚未支援閱讀。</p>
            )}
            <p className="quiet-note">
              {book.cloudSource
                ? '原檔已有雲端副本；最新設定的同步狀態請至設定查看。'
                : '尚未備份原檔，請保留原始檔案。'}
            </p>
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
