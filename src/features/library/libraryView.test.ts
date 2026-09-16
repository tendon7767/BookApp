import { expect, it } from 'vitest'
import type { LibraryBook } from '../../domain/book'
import { categoriesFor, defaultLibraryFilter, progressLabel, visibleBooks } from './libraryView'

const a: LibraryBook = {
  id: 'a',
  title: '新書名',
  originalTitle: 'Old Story',
  author: '作者甲',
  category: '小說',
  format: 'txt',
  createdAt: 1,
  modifiedAt: 1000,
  fileName: 'source.txt',
  fileHash: 'a',
  fileSize: 1,
  hasCover: false,
}
const b: LibraryBook = {
  ...a,
  id: 'b',
  title: '故事10',
  author: '作者乙',
  category: null,
  createdAt: 3,
  progress: {
    bookId: 'b',
    location: { format: 'txt', characterOffset: 40 },
    percentage: 0.4,
    updatedAt: 10,
  },
}
const c: LibraryBook = {
  ...b,
  id: 'c',
  title: '故事2',
  category: 'all',
  createdAt: 2,
  progress: { ...b.progress!, bookId: 'c', percentage: 0.999, updatedAt: 20 },
}
const books = [a, b, c]
it('searches normalized title/original/author/category/file terms together', () => {
  expect(visibleBooks(books, { ...defaultLibraryFilter, query: 'ＯＬＤ  作者甲' })).toEqual([a])
  expect(visibleBooks(books, { ...defaultLibraryFilter, query: '小說 source.TXT' })).toEqual([a])
  expect(visibleBooks(books, { ...defaultLibraryFilter, query: '不存在' })).toEqual([])
})
it('filters null categories and category names that resemble selector values', () => {
  expect(visibleBooks(books, { ...defaultLibraryFilter, category: 'uncategorized' })).toEqual([b])
  expect(visibleBooks(books, { ...defaultLibraryFilter, category: 'category:all' })).toEqual([c])
  expect(categoriesFor([a, a, b, c])).toHaveLength(2)
})
it('sorts reading timestamps, not edits, with deterministic unread/numbered-title order', () => {
  expect(visibleBooks(books, defaultLibraryFilter).map((b) => b.id)).toEqual(['c', 'b', 'a'])
  expect(visibleBooks(books, { ...defaultLibraryFilter, sort: 'added' }).map((b) => b.id)).toEqual([
    'b',
    'c',
    'a',
  ])
  const sorted = visibleBooks([b, c], { ...defaultLibraryFilter, sort: 'title' })
  expect(sorted.map((b) => b.id)).toEqual(['c', 'b'])
  expect(books.map((b) => b.id)).toEqual(['a', 'b', 'c'])
})
it('distinguishes unread, started at zero and truly completed', () => {
  expect(progressLabel(a)).toBe('尚未閱讀')
  expect(progressLabel(b)).toBe('已讀 40%')
  expect(progressLabel(c)).toBe('已讀 99%')
  expect(progressLabel({ ...b, progress: { ...b.progress!, percentage: 0 } })).toBe('已讀 0%')
  expect(progressLabel({ ...b, progress: { ...b.progress!, percentage: 1 } })).toBe('已讀完')
})
