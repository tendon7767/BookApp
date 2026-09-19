import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Cloud, Pencil, Trash2 } from 'lucide-react'
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
  const closeRef = useRef(onClose)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = saving
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [confirming])
  useEffect(() => {
    const element = dialog.current
    if (!element || editing || busy) return

    const content = element.querySelector<HTMLElement>('.sheet-body')
    let startY: number | null = null
    let startX = 0
    let startTime = 0
    let distance = 0
    let dragging = false
    let closing = false
    let animation: number | undefined

    function reset() {
      if (!element) return
      element.style.transition = 'transform 200ms ease-out'
      element.style.transform = ''
      animation = window.setTimeout(() => {
        element.style.transition = ''
      }, 200)
    }

    function touchStart(event: TouchEvent) {
      if (!element || closing || event.touches.length !== 1 || (content?.scrollTop ?? 0) > 0) return
      if ((event.target as Element).closest('.book-detail-tools, .book-detail-back-bar')) return
      if (animation) window.clearTimeout(animation)
      startY = event.touches[0].clientY
      startX = event.touches[0].clientX
      startTime = performance.now()
      distance = 0
      dragging = false
    }

    function touchMove(event: TouchEvent) {
      if (!element || startY === null || event.touches.length !== 1) return
      if ((content?.scrollTop ?? 0) > 0) {
        startY = null
        return
      }
      const moveY = event.touches[0].clientY - startY
      const moveX = event.touches[0].clientX - startX
      if (!dragging && Math.abs(moveX) > Math.abs(moveY)) {
        startY = null
        return
      }
      if (moveY <= 4) return
      event.preventDefault()
      dragging = true
      distance = moveY
      element.style.transition = 'none'
      element.style.transform = `translateY(${distance}px)`
    }

    function touchEnd() {
      if (!element || startY === null) return
      const shouldClose =
        dragging &&
        (distance > Math.min(140, element.clientHeight * 0.25) ||
          (distance > 45 && distance / Math.max(1, performance.now() - startTime) > 0.65))
      startY = null
      if (shouldClose) {
        closing = true
        element.style.transition = 'transform 200ms ease-out'
        element.style.transform = 'translateY(100dvh)'
        animation = window.setTimeout(() => closeRef.current(), 200)
      } else if (dragging) reset()
      dragging = false
    }

    function touchCancel() {
      startY = null
      if (dragging) reset()
      dragging = false
    }

    element.addEventListener('touchstart', touchStart, { passive: true })
    element.addEventListener('touchmove', touchMove, { passive: false })
    element.addEventListener('touchend', touchEnd)
    element.addEventListener('touchcancel', touchCancel)
    return () => {
      element.removeEventListener('touchstart', touchStart)
      element.removeEventListener('touchmove', touchMove)
      element.removeEventListener('touchend', touchEnd)
      element.removeEventListener('touchcancel', touchCancel)
      if (animation) window.clearTimeout(animation)
      element.style.transition = ''
      element.style.transform = ''
    }
  }, [editing, busy])
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
        <h2 id="book-title">
          {book.title}
          {!editing && <span className="book-detail-author"> · {book.author || '未提供作者'}</span>}
        </h2>
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
            {book.series && (
              <p className="book-detail-series">
                {book.series}
                {book.volume != null ? ' 第 ' + book.volume + ' 集' : ''}
              </p>
            )}
            <div className="book-detail-progress">
              <div className="book-detail-bar" role="img" aria-label={progressLabel(book)}>
                <span
                  className="book-detail-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, (book.progress?.percentage ?? 0) * 100))}%`,
                  }}
                />
                <strong aria-hidden="true">{progressLabel(book)}</strong>
              </div>
              {book.progress && (
                <p className="book-detail-last-read">
                  最後閱讀：
                  <time dateTime={new Date(book.progress.updatedAt).toISOString()}>
                    {new Intl.DateTimeFormat('zh-TW', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(book.progress.updatedAt)}
                  </time>
                </p>
              )}
            </div>
            <div className="book-facts">
              <span>{book.category || '未分類'}</span>
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
              <summary>檔案資訊</summary>
              <dl className="book-file-info">
                <div>
                  <dt>檔名</dt>
                  <dd>{book.fileName}</dd>
                </div>
                <div>
                  <dt>檔案類型</dt>
                  <dd>{book.format.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>檔案大小</dt>
                  <dd>{formatFileSize(book.fileSize)}</dd>
                </div>
              </dl>
            </details>
          </>
        )}
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
      </div>
      {!editing && (
        <div className="book-detail-back-bar">
          <button className="secondary-button" onClick={onClose}>
            <ArrowLeft size={20} aria-hidden="true" />
            返回書架
          </button>
        </div>
      )}
    </dialog>
  )
}
