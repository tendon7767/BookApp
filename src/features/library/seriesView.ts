import type { LibraryBook } from '../../domain/book'

const collator = new Intl.Collator('zh-Hant', { numeric: true })
export const seriesNamesFor = (books: LibraryBook[]) =>
  [...new Set(books.flatMap((b) => (b.series ? [b.series] : [])))].sort(collator.compare)

export function orderVolumes(books: LibraryBook[]) {
  return [...books].sort(
    (a, b) =>
      (a.volume ?? Infinity) - (b.volume ?? Infinity) ||
      collator.compare(a.title, b.title) ||
      a.id.localeCompare(b.id),
  )
}

export type ShelfEntry =
  { kind: 'book'; book: LibraryBook } | { kind: 'series'; name: string; books: LibraryBook[] }

// Input already follows the active shelf sort. A series takes the place of its first matching book.
export function groupSeries(books: LibraryBook[]): ShelfEntry[] {
  const groups = new Map<string, Extract<ShelfEntry, { kind: 'series' }>>()
  const result: ShelfEntry[] = []
  for (const book of books) {
    if (!book.series) {
      result.push({ kind: 'book', book })
      continue
    }
    let group = groups.get(book.series)
    if (!group) {
      group = { kind: 'series', name: book.series, books: [] }
      groups.set(book.series, group)
      result.push(group)
    }
    group.books.push(book)
  }
  return result
}
