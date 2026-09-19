import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useBackLayer } from '../../platform/useBackLayer'
import type { ReaderSearchResult } from './search'

export function ReaderToolsDialog({
  onClose,
  onSearch,
  onSelect,
}: {
  onClose: () => void
  onSearch: (query: string) => Promise<ReaderSearchResult[]>
  onSelect: (result: ReaderSearchResult) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useBackLayer(true, onClose)
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
        <h2 id="reader-tools-title">搜尋</h2>
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
    </dialog>
  )
}
