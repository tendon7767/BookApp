import { useEffect, useRef, useState } from 'react'
import { Bookmark, Search, Trash2, X } from 'lucide-react'
import type { ReadingMarks } from '../../domain/readingMarks'
import type { ReaderSearchResult } from './search'

export function ReaderToolsDialog({
  marks,
  onClose,
  onSearch,
  onSelect,
  onRemoveBookmark,
}: {
  marks: ReadingMarks
  onClose: () => void
  onSearch: (query: string) => Promise<ReaderSearchResult[]>
  onSelect: (result: ReaderSearchResult) => void
  onRemoveBookmark: (id: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ReaderSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  async function search() {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      setResults(await onSearch(query))
      setSearched(true)
    } catch {
      setError('搜尋未能完成，請縮短關鍵字後重試。')
    } finally {
      setSearching(false)
    }
  }
  return (
    <dialog
      ref={ref}
      className="reader-tools-dialog"
      aria-labelledby="reader-tools-title"
      onCancel={onClose}
    >
      <header className="toc-header">
        <h2 id="reader-tools-title">搜尋與書籤</h2>
        <button className="icon-button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
      </header>
      <form
        className="reader-search-form"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="搜尋書內文字"
          placeholder="搜尋書內文字"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button disabled={!query.trim() || searching}>{searching ? '搜尋中' : '搜尋'}</button>
      </form>
      {results.length > 0 && (
        <section className="reader-tool-section" aria-labelledby="search-results-title">
          <h3 id="search-results-title">搜尋結果 · {results.length}</h3>
          <ol className="reader-result-list">
            {results.map((result) => (
              <li key={result.id}>
                <button onClick={() => onSelect(result)}>
                  {result.chapter && <small>{result.chapter}</small>}
                  <span>{result.excerpt}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {error && (
        <p className="quiet-note" role="alert">
          {error}
        </p>
      )}
      {!searching && searched && results.length === 0 && (
        <p className="quiet-note">沒有搜尋結果。</p>
      )}
      <section className="reader-tool-section" aria-labelledby="bookmarks-title">
        <h3 id="bookmarks-title">
          <Bookmark size={17} /> 書籤 · {marks.bookmarks.length}
        </h3>
        {marks.bookmarks.length ? (
          <ol className="reader-result-list bookmark-list">
            {marks.bookmarks.map((bookmark) => (
              <li key={bookmark.id}>
                <button
                  onClick={() =>
                    onSelect({
                      id: bookmark.id,
                      location: bookmark.location,
                      excerpt: bookmark.excerpt || bookmark.label,
                    })
                  }
                >
                  <small>{Math.round(bookmark.percentage * 100)}%</small>
                  <span>{bookmark.label}</span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`刪除書籤 ${bookmark.label}`}
                  onClick={() => onRemoveBookmark(bookmark.id)}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="quiet-note">還沒有書籤。</p>
        )}
      </section>
      <section className="reader-tool-section" aria-labelledby="trail-title">
        <h3 id="trail-title">跳轉足跡 · {marks.trail.length}</h3>
        {marks.trail.length ? (
          <ol className="reader-result-list">
            {marks.trail.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() =>
                    onSelect({ id: entry.id, location: entry.location, excerpt: entry.label })
                  }
                >
                  <small>{Math.round(entry.percentage * 100)}%</small>
                  <span>{entry.label}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="quiet-note">使用目錄、進度或搜尋跳轉後，這裡會保留原位置。</p>
        )}
      </section>
    </dialog>
  )
}
