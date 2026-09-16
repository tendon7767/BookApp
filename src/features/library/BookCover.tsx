import { useEffect, useRef, useState } from 'react'
import { BookOpen } from 'lucide-react'
import type { BookMetadata } from '../../domain/book'
import { getBookCover } from '../../storage/bookRepository'

export function BookCover({ book }: { book: BookMetadata }) {
  const host = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!book.hasCover || !host.current) return
    let cancelled = false
    let objectUrl: string | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void getBookCover(book.id)
          .then((blob) => {
            if (blob && !cancelled) {
              objectUrl = URL.createObjectURL(blob)
              setUrl(objectUrl)
            }
          })
          .catch(() => {
            if (!cancelled) setFailed(true)
          })
      },
      { rootMargin: '160px' },
    )
    observer.observe(host.current)
    return () => {
      cancelled = true
      observer.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [book.id, book.hasCover, book.coverCached])

  return (
    <span ref={host} className={`book-cover cover-tone-${parseInt(book.id.slice(0, 2), 16) % 4}`}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="generated-cover" aria-hidden="true">
          <BookOpen size={19} />
          <span>{book.title}</span>
          <small>{book.format.toUpperCase()}</small>
        </span>
      )}
    </span>
  )
}
