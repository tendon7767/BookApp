import type { ReadingLocation } from '../domain/book'
import {
  emptyReadingMarks,
  type Bookmark,
  type ReadingMarks,
  type ReadingTrailEntry,
} from '../domain/readingMarks'
import { openReaderDatabase } from './database'

const MAX_TRAIL = 20

function sameLocation(a: ReadingLocation, b: ReadingLocation) {
  return (
    a.format === b.format &&
    (a.format === 'epub'
      ? b.format === 'epub' && a.cfi === b.cfi
      : a.format === 'txt'
        ? b.format === 'txt' && a.characterOffset === b.characterOffset
        : b.format === 'pdf' && a.page === b.page)
  )
}

async function update(bookId: string, change: (marks: ReadingMarks) => ReadingMarks) {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction('readingMarks', 'readwrite')
    const next = change((await tx.store.get(bookId)) ?? emptyReadingMarks())
    await tx.store.put(next, bookId)
    await tx.done
    return next
  } finally {
    db.close()
  }
}

export async function readReadingMarks(bookId: string) {
  const db = await openReaderDatabase()
  try {
    return (await db.get('readingMarks', bookId)) ?? emptyReadingMarks()
  } finally {
    db.close()
  }
}

export function addBookmark(
  bookId: string,
  value: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>,
) {
  return update(bookId, (marks) => {
    const now = Math.max(Date.now(), marks.updatedAt + 1)
    const existing = marks.bookmarks.find((item) => sameLocation(item.location, value.location))
    const bookmark: Bookmark = existing
      ? { ...existing, ...value, updatedAt: now }
      : { ...value, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    return {
      bookmarks: [bookmark, ...marks.bookmarks.filter((item) => item.id !== bookmark.id)],
      trail: marks.trail,
      updatedAt: now,
    }
  })
}

export function removeBookmark(bookId: string, id: string) {
  return update(bookId, (marks) => ({
    ...marks,
    bookmarks: marks.bookmarks.filter((item) => item.id !== id),
    updatedAt: Math.max(Date.now(), marks.updatedAt + 1),
  }))
}

export function pushReadingTrail(
  bookId: string,
  value: Omit<ReadingTrailEntry, 'id' | 'createdAt'>,
) {
  return update(bookId, (marks) => {
    const now = Math.max(Date.now(), marks.updatedAt + 1)
    const previous = marks.trail[0]
    if (previous && sameLocation(previous.location, value.location)) return marks
    return {
      bookmarks: marks.bookmarks,
      trail: [{ ...value, id: crypto.randomUUID(), createdAt: now }, ...marks.trail].slice(
        0,
        MAX_TRAIL,
      ),
      updatedAt: now,
    }
  })
}

export async function popReadingTrail(bookId: string) {
  let popped: ReadingTrailEntry | undefined
  const marks = await update(bookId, (current) => {
    ;[popped] = current.trail
    return popped
      ? {
          ...current,
          trail: current.trail.slice(1),
          updatedAt: Math.max(Date.now(), current.updatedAt + 1),
        }
      : current
  })
  return { marks, popped }
}
