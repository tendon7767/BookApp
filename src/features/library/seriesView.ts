import type { LibraryBook } from '../../domain/book'

const collator = new Intl.Collator('zh-Hant', { numeric: true })
export const seriesNamesFor = (books: LibraryBook[]) =>
  [...new Set(books.flatMap((b) => (b.series ? [b.series] : [])))].sort(collator.compare)

export const seriesSorts = ['volume', 'volumeDesc', 'recent', 'added', 'title'] as const
export type SeriesSort = (typeof seriesSorts)[number]
export const seriesSortLabels: Record<SeriesSort, string> = {
  volume: '集數順序',
  volumeDesc: '集數倒序',
  recent: '最近閱讀',
  added: '最近加入',
  title: '書名排序',
}

// Volume order is the series' own identity, so it stays the tie-breaker for every mode.
export function orderVolumes(books: LibraryBook[], sort: SeriesSort = 'volume') {
  const byVolume = (a: LibraryBook, b: LibraryBook) =>
    (a.volume ?? Infinity) - (b.volume ?? Infinity) ||
    collator.compare(a.title, b.title) ||
    a.id.localeCompare(b.id)
  return [...books].sort((a, b) => {
    if (sort === 'volumeDesc') return -byVolume(a, b)
    if (sort === 'recent') {
      const recent = (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0)
      if (recent) return recent
    }
    if (sort === 'added') {
      const added = b.createdAt - a.createdAt
      if (added) return added
    }
    if (sort === 'title') {
      const title = collator.compare(a.title, b.title)
      if (title) return title
    }
    return byVolume(a, b)
  })
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
