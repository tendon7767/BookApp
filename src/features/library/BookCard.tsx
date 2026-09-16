import { Check } from 'lucide-react'
import type { LibraryBook } from '../../domain/book'
import { BookCover } from './BookCover'
import { progressLabel } from './libraryView'
export function BookCard({
  book,
  selecting,
  checked,
  onToggle,
  onInfo,
  showVolume,
}: {
  book: LibraryBook
  selecting: boolean
  checked: boolean
  onToggle: () => void
  onInfo: () => void
  showVolume: boolean
}) {
  return (
    <div className="book-card-wrap">
      <button
        className="book-card"
        onClick={() => (selecting ? onToggle() : onInfo())}
        aria-label={`${selecting ? '選取' : '開啟'} ${book.title}`}
        aria-pressed={selecting ? checked : undefined}
      >
        <span className="book-cover-wrap">
          <BookCover book={book} />
          <span className="book-cover-progress" aria-label={progressLabel(book)}>
            <span
              className="book-progress-fill"
              style={{
                width: `${Math.max(0, Math.min(100, (book.progress?.percentage ?? 0) * 100))}%`,
              }}
            />
            <span className="book-progress-label">
              {book.progress
                ? progressLabel(book).replace('已讀 ', '').replace('已讀完', '100%')
                : '未讀'}
            </span>
          </span>
          {selecting && (
            <span
              className={`book-selection-mark${checked ? ' is-selected' : ''}`}
              aria-hidden="true"
            >
              {checked && <Check size={18} />}
            </span>
          )}
        </span>
        <span className="book-card-title">{book.title}</span>
        {showVolume && (
          <span className="series-caption">
            {book.volume != null ? '第 ' + book.volume + ' 集' : '未編集數'}
          </span>
        )}
      </button>
    </div>
  )
}
