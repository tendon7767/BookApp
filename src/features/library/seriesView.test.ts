import { expect, it } from 'vitest'
import type { LibraryBook } from '../../domain/book'
import { groupSeries, orderVolumes } from './seriesView'
import { visibleBooks, defaultLibraryFilter } from './libraryView'

const book = (id: string, series?: string, volume?: number): LibraryBook => ({
  id,
  title: `書 ${id}`,
  originalTitle: id,
  author: '',
  format: 'txt',
  category: null,
  series,
  volume,
  createdAt: 1,
  modifiedAt: 1,
  fileName: `${id}.txt`,
  fileHash: id,
  fileSize: 1,
  hasCover: false,
})
it('groups only matching volumes and preserves the shelf order without mutating input', () => {
  const books = [book('10', '山城', 10), book('solo'), book('2', '山城', 2), book('extra', '山城')]
  const entries = groupSeries(books)
  expect(entries.map((e) => e.kind)).toEqual(['series', 'book'])
  expect(orderVolumes(books.filter((b) => b.series)).map((b) => b.id)).toEqual(['2', '10', 'extra'])
  expect(books[0].id).toBe('10')
  expect(visibleBooks(books, { ...defaultLibraryFilter, query: '山城' })).toHaveLength(3)
  const filtered = groupSeries(visibleBooks(books, { ...defaultLibraryFilter, query: '山城 10' }))
  expect(filtered[0]).toMatchObject({ kind: 'series', books: [{ id: '10' }] })
})

it('orders a series by the chosen sort and keeps volume order as tie-breaker', () => {
  const books = [
    { ...book('10', '山城', 10), createdAt: 5 },
    { ...book('2', '山城', 2), createdAt: 9 },
    { ...book('extra', '山城'), createdAt: 7 },
  ]
  expect(orderVolumes(books, 'volumeDesc').map((b) => b.id)).toEqual(['extra', '10', '2'])
  expect(orderVolumes(books, 'added').map((b) => b.id)).toEqual(['2', 'extra', '10'])
  expect(orderVolumes(books, 'title').map((b) => b.id)).toEqual(['2', '10', 'extra'])
  expect(orderVolumes(books, 'recent').map((b) => b.id)).toEqual(['2', '10', 'extra'])
})
