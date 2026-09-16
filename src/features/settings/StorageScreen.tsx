import { useEffect, useMemo, useState } from 'react'
import { Check, Cloud, Download, HardDrive, Trash2 } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'
import { removeBookDownloads } from '../../storage/bookRepository'

function bytes(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`
}

export function StorageScreen({
  books,
  cloudConnected,
  online,
  cloudError,
  busy,
  onDownload,
  onCloud,
  onChanged,
}: {
  books: LibraryBook[]
  cloudConnected: boolean
  online: boolean
  cloudError: string
  busy: boolean
  onDownload: (books: LibraryBook[]) => Promise<boolean | undefined>
  onCloud: () => void
  onChanged: () => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number }>({})
  const [message, setMessage] = useState('')
  const downloaded = books.filter((book) => book.downloaded !== false)
  const cloudOnly = books.filter((book) => book.downloaded === false)
  const knownBytes = downloaded.reduce((sum, book) => sum + book.fileSize, 0)
  const selectedBooks = useMemo(
    () => books.filter((book) => selected.has(book.id)),
    [books, selected],
  )
  const removable = selectedBooks.filter((book) => book.downloaded !== false && book.cloudSource)
  const downloadable = selectedBooks.filter((book) => book.downloaded === false)
  async function refreshEstimate() {
    try {
      setEstimate((await navigator.storage?.estimate?.()) ?? {})
    } catch {
      setEstimate({})
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- synchronize the browser quota estimate with the current downloaded set.
    void refreshEstimate()
  }, [books])
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <section className="storage-screen" aria-label="儲存空間">
      <section className="settings-section">
        <h2>儲存空間</h2>
        <div className="storage-summary">
          <HardDrive size={22} />
          <div>
            <strong>本機書檔 {bytes(knownBytes)}</strong>
            <p>
              {downloaded.length} 本已下載 · {cloudOnly.length} 本僅在雲端
            </p>
          </div>
        </div>
        {estimate.usage !== undefined && (
          <p className="quiet-note">
            App 與瀏覽器資料約 {bytes(estimate.usage)}
            {estimate.quota ? `／可用上限約 ${bytes(estimate.quota)}` : ''}。瀏覽器數字為估算值。
          </p>
        )}
      </section>
      <section className="settings-section">
        <div className="storage-list-header">
          <h2>管理下載</h2>
          <button
            onClick={() =>
              setSelected(
                selected.size === books.length ? new Set() : new Set(books.map((b) => b.id)),
              )
            }
          >
            {selected.size === books.length && books.length ? '取消全選' : '全選'}
          </button>
        </div>
        <div className="storage-book-list">
          {books.map((book) => (
            <label key={book.id} className="storage-book-row">
              <input
                type="checkbox"
                checked={selected.has(book.id)}
                onChange={() => toggle(book.id)}
              />
              <div>
                <strong>{book.title}</strong>
                <span>{bytes(book.fileSize)}</span>
              </div>
              <span className="storage-state">
                {book.downloaded === false ? (
                  <>
                    <Cloud size={16} /> 雲端
                  </>
                ) : (
                  <>
                    <Check size={16} /> 已下載
                  </>
                )}
              </span>
            </label>
          ))}
        </div>
        {!books.length && <p className="quiet-note">書架目前沒有書籍。</p>}
      </section>
      <div className="storage-actions">
        <button
          disabled={!downloadable.length || busy || !cloudConnected || !online}
          onClick={() =>
            void onDownload(downloadable).then(async (ok) => {
              if (!ok) {
                setMessage('下載未完成，已下載的檔案仍會保留。')
                return
              }
              setSelected(new Set())
              setMessage(`已下載 ${downloadable.length} 本書。`)
              await refreshEstimate()
            })
          }
        >
          <Download size={18} /> 下載所選 {downloadable.length ? `(${downloadable.length})` : ''}
        </button>
        <button
          disabled={!removable.length || busy}
          onClick={() => {
            if (
              !confirm(`要移除 ${removable.length} 本書的本機下載嗎？書架、進度與雲端原檔會保留。`)
            )
              return
            void removeBookDownloads(removable.map((book) => book.id))
              .then(async () => {
                setSelected(new Set())
                setMessage(
                  `已釋放約 ${bytes(removable.reduce((sum, book) => sum + book.fileSize, 0))}。`,
                )
                await onChanged()
                await refreshEstimate()
              })
              .catch(() => setMessage('本機下載未能移除，請關閉其他「看書」視窗後重試。'))
          }}
        >
          <Trash2 size={18} /> 移除所選下載 {removable.length ? `(${removable.length})` : ''}
        </button>
      </div>
      {!cloudConnected && cloudOnly.length > 0 && (
        <button className="secondary-button storage-connect" onClick={onCloud}>
          連接 Google Drive 以下載雲端書籍
        </button>
      )}
      {!online && <p className="inline-warning">目前離線，連線後才能下載雲端書籍。</p>}
      {cloudError && (
        <p className="inline-warning" role="alert">
          {cloudError}
        </p>
      )}
      {message && (
        <p className="inline-warning" role="status">
          {message}
        </p>
      )}
      <p className="quiet-note">尚未備份到雲端的書籍不能只移除下載，避免失去唯一原檔。</p>
    </section>
  )
}
