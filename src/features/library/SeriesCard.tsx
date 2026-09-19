import { LibraryBig } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'
import { BookCover } from './BookCover'
import { orderVolumes } from './seriesView'

export function SeriesCard({
  name,
  books,
  total,
  onOpen,
}: {
  name: string
  books: LibraryBook[]
  total: number
  onOpen: () => void
}) {
  const first = orderVolumes(books)[0]!
  return (
    <div className="book-card-wrap">
      <button
        className="book-card book-card-cover series-card"
        aria-label={`開啟系列 ${name}`}
        onClick={onOpen}
      >
        <span className="book-cover-wrap">
          <BookCover book={{ ...first, title: name }} />
          <span className="series-badge">
            <LibraryBig size={14} />
            {books.length === total ? `${total} 本` : `${books.length}/${total} 本符合`}
          </span>
        </span>
      </button>
      {/* Mirrors a book card so the titles line up; the cover button carries the name. */}
      <button className="book-card-title" aria-hidden="true" tabIndex={-1} onClick={onOpen}>
        {name}
      </button>
    </div>
  )
}
