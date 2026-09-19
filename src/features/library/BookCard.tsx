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
  onRead,
  showVolume,
}: {
  book: LibraryBook
  selecting: boolean
  checked: boolean
  onToggle: () => void
  onInfo: () => void
  onRead: () => void
  showVolume: boolean
}) {
  const readable = book.format === 'epub' || book.format === 'txt'
  return (
    <div className={`book-card-wrap${selecting && checked ? ' is-selected' : ''}`}>
      <button
        className="book-card book-card-cover"
        onClick={() => (selecting ? onToggle() : onInfo())}
        aria-label={`${selecting ? '選取' : '書籍資訊'} ${book.title}`}
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
              {checked && <Check size={17} strokeWidth={3} />}
            </span>
          )}
        </span>
      </button>
      <button
        className="book-card-title"
        // Tapping the cover opens the details sheet; the title starts reading straight away.
        onClick={() => (selecting ? onToggle() : readable ? onRead() : onInfo())}
        // While selecting, the cover button already carries the name and pressed state.
        aria-hidden={selecting || undefined}
        tabIndex={selecting ? -1 : undefined}
        aria-label={selecting ? undefined : `${readable ? '閱讀' : '書籍資訊'} ${book.title}`}
      >
        {book.title}
      </button>
      {showVolume && (
        <span className="series-caption">
          {book.volume != null ? '第 ' + book.volume + ' 集' : '未編集數'}
        </span>
      )}
    </div>
  )
}
