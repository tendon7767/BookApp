import { useState } from 'react'
import { ArrowLeft, SquareCheckBig } from 'lucide-react'
import type { BookMetadata, LibraryBook } from '../../domain/book'
import type { LibraryState } from './useLibrary'
import { BookCard } from './BookCard'
import { SeriesCard } from './SeriesCard'
import { SeriesDialog } from './SeriesDialog'
import { groupSeries, orderVolumes, seriesNamesFor } from './seriesView'
import { BookDetails } from './BookDetails'
import { ImportControls } from './ImportControls'
import { LibraryFilters } from './LibraryFilters'
import { BulkBookDialog } from './BulkBookDialog'
import { LibrarySelectionBar } from './LibrarySelectionBar'
import { categoriesFor, visibleBooks } from './libraryView'

export function LibraryScreen({
  library,
  onRead,
}: {
  library: LibraryState
  onRead: (book: BookMetadata) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [seriesBooks, setSeriesBooks] = useState<LibraryBook[] | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<{ kind: 'category' | 'remove'; books: LibraryBook[] } | null>(
    null,
  )
  const chosen = library.books.filter((b) => checked.has(b.id))
  const selected = library.books.find((book) => book.id === selectedId)
  const categories = categoriesFor(library.books)
  const seriesNames = seriesNamesFor(library.books)
  const matching = visibleBooks(library.books, library.filter)
  const books = library.activeSeries
    ? orderVolumes(matching.filter((b) => b.series === library.activeSeries))
    : matching
  const entries =
    library.activeSeries || selecting
      ? books.map((book) => ({ kind: 'book' as const, book }))
      : groupSeries(books)
  function finishSelection() {
    setSelecting(false)
    setChecked(new Set())
  }
  function toggle(id: string) {
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <section aria-label="書架" className="library-screen">
      <LibraryFilters
        filter={library.filter}
        categories={categories}
        onChange={library.setFilter}
      />
      {library.activeSeries && (
        <div className="series-heading">
          <button
            className="icon-button"
            aria-label="返回全部書籍"
            onClick={() => {
              library.setActiveSeries(null)
              finishSelection()
            }}
          >
            <ArrowLeft size={22} />
          </button>
          <span>
            {library.activeSeries}
            <small>依集數排列 · {books.length} 本</small>
          </span>
        </div>
      )}
      {(library.filter.query || library.filter.category !== 'all') && (
        <div className="library-summary" role="status">
          找到 {books.length} 本書
        </div>
      )}
      <ImportControls library={library} selecting={selecting}>
        {selecting ? (
          <LibrarySelectionBar
            count={chosen.length}
            all={!!books.length && books.every((b) => checked.has(b.id))}
            disabled={!books.length}
            onAll={() =>
              setChecked((previous) => {
                const next = new Set(previous)
                const all = books.every((b) => previous.has(b.id))
                books.forEach((b) => (all ? next.delete(b.id) : next.add(b.id)))
                return next
              })
            }
            onSeries={() => setSeriesBooks(chosen)}
            onCategory={() => setBulk({ kind: 'category', books: chosen })}
            onRemove={() => setBulk({ kind: 'remove', books: chosen })}
            onCancel={finishSelection}
          />
        ) : (
          <button
            className="library-action"
            aria-label="批次編輯"
            disabled={!library.books.length || !!library.progress}
            onClick={() => setSelecting(true)}
          >
            <SquareCheckBig size={22} />
            <span>批次編輯</span>
          </button>
        )}
      </ImportControls>
      {library.error && (
        <div className="inline-warning">
          <p role="alert">{library.error}</p>
          <button className="secondary-button" onClick={() => void library.reload()}>
            重試讀取書庫
          </button>
        </div>
      )}
      {!library.loading && !library.error && !library.books.length && (
        <div className="empty-library">
          <h2>尚無書籍</h2>
          <p>匯入 EPUB 或 TXT 即可加入書架。</p>
        </div>
      )}
      {!!library.books.length && (
        <>
          {!books.length && (
            <div className="empty-results">
              <p>沒有符合的書籍</p>
              <button
                className="secondary-button"
                onClick={() => library.setFilter({ ...library.filter, query: '', category: 'all' })}
              >
                清除篩選
              </button>
            </div>
          )}
          <div className="book-grid">
            {entries.map((entry) => {
              if (entry.kind === 'series')
                return (
                  <SeriesCard
                    key={'series:' + entry.name}
                    name={entry.name}
                    books={entry.books}
                    total={library.books.filter((b) => b.series === entry.name).length}
                    onOpen={() => {
                      library.setActiveSeries(entry.name)
                      window.scrollTo(0, 0)
                    }}
                  />
                )
              const book = entry.book
              return (
                <BookCard
                  key={book.id}
                  book={book}
                  selecting={selecting}
                  checked={checked.has(book.id)}
                  onToggle={() => toggle(book.id)}
                  onInfo={() => setSelectedId(book.id)}
                  showVolume={!!library.activeSeries}
                />
              )
            })}
          </div>
          <p className="quiet-note library-stage-note">
            已下載的書籍可離線閱讀；備份狀態可在設定中查看。
          </p>
        </>
      )}
      {seriesBooks && (
        <SeriesDialog
          books={seriesBooks}
          names={seriesNames}
          onClose={() => setSeriesBooks(null)}
          onApply={async (name, entries) => {
            await library.bulkSeries(name, entries)
            finishSelection()
            if (library.activeSeries) library.setActiveSeries(name.trim() || null)
          }}
        />
      )}
      {bulk && (
        <BulkBookDialog
          kind={bulk.kind}
          books={bulk.books}
          categories={categories}
          onClose={() => setBulk(null)}
          onApply={async (category) => {
            const ids = bulk.books.map((b) => b.id)
            if (bulk.kind === 'category') await library.bulkCategory(ids, category)
            else await library.bulkRemove(ids)
            finishSelection()
          }}
        />
      )}
      {selected && (
        <BookDetails
          key={selected.id}
          book={selected}
          categories={categories}
          seriesNames={seriesNames}
          onSave={library.editBook}
          onClose={() => setSelectedId(null)}
          onRemove={library.removeBook}
          onRead={() => onRead(selected)}
        />
      )}
    </section>
  )
}
