import type { LibraryBook } from '../../domain/book'

export type LibrarySort = 'recent' | 'added' | 'title'
export interface LibraryFilter {
  query: string
  category: string
  sort: LibrarySort
}
export const defaultLibraryFilter: LibraryFilter = { query: '', category: 'all', sort: 'recent' }
const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' })
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase()

export function categoriesFor(books: LibraryBook[]): string[] {
  return [...new Set(books.flatMap((book) => (book.category ? [book.category] : [])))].sort(
    collator.compare,
  )
}
export function visibleBooks(books: LibraryBook[], filter: LibraryFilter): LibraryBook[] {
  const words = normalize(filter.query).trim().split(/\s+/).filter(Boolean)
  return books
    .filter((book) => {
      if (filter.category === 'uncategorized' && book.category) return false
      if (filter.category.startsWith('category:') && book.category !== filter.category.slice(9))
        return false
      const search = normalize(
        [
          book.title,
          book.originalTitle,
          book.author,
          book.category,
          book.series,
          book.fileName,
        ].join(' '),
      )
      return words.every((word) => search.includes(word))
    })
    .sort((a, b) => {
      if (filter.sort === 'recent') {
        const recent = (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0)
        if (recent) return recent
      }
      if (filter.sort === 'title') {
        const title = collator.compare(a.title, b.title)
        if (title) return title
      }
      return b.createdAt - a.createdAt || a.id.localeCompare(b.id)
    })
}
export function progressLabel(book: LibraryBook): string {
  if (!book.progress) return '尚未閱讀'
  const percentage = Math.max(0, Math.min(1, book.progress.percentage))
  return percentage === 1 ? '已讀完' : `已讀 ${Math.min(99, Math.round(percentage * 100))}%`
}
