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
      <button className="book-card series-card" aria-label={`開啟系列 ${name}`} onClick={onOpen}>
        <span className="book-cover-wrap">
          <BookCover book={{ ...first, title: name }} />
          <span className="series-badge">
            <LibraryBig size={14} />
            {books.length === total ? `${total} 本` : `${books.length}/${total} 本符合`}
          </span>
        </span>
        <span className="book-card-title">{name}</span>
      </button>
    </div>
  )
}
