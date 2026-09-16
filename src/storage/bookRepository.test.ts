import { assignSeries } from './seriesRepository'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import type { BookMetadata } from '../domain/book'
import { DATABASE_NAME, openReaderDatabase } from './database'
import { defaultReadingSettings } from '../features/reader/readingSettings'
import {
  deleteLocalBook,
  getBookCover,
  getBookFile,
  listBooks,
  saveImportedBook,
  categorizeBooks,
  deleteLocalBooks,
  updateBookMetadata,
  listLibraryBooks,
} from './bookRepository'

const book: BookMetadata = {
  id: 'book-a',
  title: '測試書',
  originalTitle: '測試書',
  author: '作者',
  format: 'epub',
  category: null,
  createdAt: 1,
  modifiedAt: 1,
  fileName: 'book.epub',
  fileHash: 'hash-a',
  fileSize: 4,
  hasCover: true,
}
it('applies batch categories atomically and preserves each original and progress', async () => {
  await saveImportedBook(book, new Blob(['book']), null)
  await saveImportedBook(
    { ...book, id: 'b', fileHash: 'b', title: '另一書' },
    new Blob(['other']),
    null,
  )
  const db = await openReaderDatabase()
  const progress = {
    bookId: book.id,
    location: { format: 'txt' as const, characterOffset: 10 },
    percentage: 0.68,
    updatedAt: 12,
  }
  await db.put('progress', progress, book.id)
  db.close()
  const result = await categorizeBooks([book.id, 'b', book.id], '  小說  ')
  expect(result).toHaveLength(2)
  expect(result.every((b) => b.category === '小說')).toBe(true)
  expect((await listLibraryBooks()).find((b) => b.id === book.id)?.progress).toEqual(progress)
  expect(await (await getBookFile('b'))?.text()).toBe('other')
  await expect(categorizeBooks([book.id, 'missing'], '不該留下')).rejects.toThrow('未套用任何變更')
  expect((await listBooks()).every((b) => b.category === '小說')).toBe(true)
  await categorizeBooks([book.id], '')
  expect((await listBooks()).find((b) => b.id === book.id)?.category).toBeNull()
})
it('batch deletion removes all related stores only for the chosen IDs', async () => {
  for (const id of ['a', 'b', 'keep'])
    await saveImportedBook({ ...book, id, fileHash: id }, new Blob([id]), new Blob(['cover']))
  const db = await openReaderDatabase()
  for (const id of ['a', 'b', 'keep']) {
    await db.put(
      'progress',
      {
        bookId: id,
        location: { format: 'txt', characterOffset: 1 },
        percentage: 0.5,
        updatedAt: 1,
      },
      id,
    )
    await db.put('readerSettings', { settings: defaultReadingSettings, updatedAt: 1 }, id)
    await db.put('epubLocations', { fileHash: id, version: 1, locations: '[]' }, id)
  }
  db.close()
  await deleteLocalBooks(['a', 'b', 'a'])
  const reopened = await openReaderDatabase()
  for (const store of [
    'books',
    'bookFiles',
    'bookCovers',
    'progress',
    'readerSettings',
    'epubLocations',
  ] as const)
    expect(await reopened.getAllKeys(store)).toEqual(['keep'])
  reopened.close()
})
afterEach(async () => {
  await deleteDB(DATABASE_NAME)
})

it('rolls back the whole bulk deletion when a later file removal fails', async () => {
  for (const id of ['a', 'b'])
    await saveImportedBook({ ...book, id, fileHash: id }, new Blob([id]), null)
  const original = IDBObjectStore.prototype.delete
  const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
    this: IDBObjectStore,
    key,
  ) {
    if (this.name === 'bookFiles' && key === 'b')
      throw new DOMException('Storage failed', 'UnknownError')
    return original.call(this, key)
  })
  try {
    await expect(deleteLocalBooks(['a', 'b'])).rejects.toThrow('Storage failed')
  } finally {
    spy.mockRestore()
  }
  expect(await listBooks()).toHaveLength(2)
  expect(await (await getBookFile('a'))?.text()).toBe('a')
  expect(await (await getBookFile('b'))?.text()).toBe('b')
})

it('edits metadata without changing original files, identity, progress or reading settings', async () => {
  await saveImportedBook(book, new Blob(['book']), new Blob(['cover']))
  const db = await openReaderDatabase()
  const progress = {
    bookId: book.id,
    location: { format: 'epub' as const, cfi: 'epubcfi(/6/2!/4/2/1:8)' },
    percentage: 0.68,
    updatedAt: 100,
  }
  await db.put('progress', progress, book.id)
  await db.put('readerSettings', { settings: defaultReadingSettings, updatedAt: 50 }, book.id)
  db.close()
  const edited = await updateBookMetadata(book.id, {
    title: '  新書名  ',
    author: ' 新作者 ',
    category: ' 小說 ',
  })
  expect(edited).toMatchObject({
    ...book,
    title: '新書名',
    author: '新作者',
    category: '小說',
    modifiedAt: expect.any(Number),
  })
  expect(edited.modifiedAt).toBeGreaterThan(book.modifiedAt)
  expect(await (await getBookFile(book.id))?.text()).toBe('book')
  expect(await (await getBookCover(book.id))?.text()).toBe('cover')
  expect(await listLibraryBooks()).toEqual([{ ...edited, progress }])
  const reopened = await openReaderDatabase()
  expect(await reopened.get('readerSettings', book.id)).toEqual({
    settings: defaultReadingSettings,
    updatedAt: 50,
  })
  reopened.close()
  // Reimporting the same bytes must retain the edited metadata.
  expect(
    (await saveImportedBook({ ...book, id: 'duplicate' }, new Blob(['book']), null)).book,
  ).toEqual(edited)
  expect(
    (await updateBookMetadata(book.id, { title: '新書名', author: '', category: '  ' })).category,
  ).toBeNull()
})
it('rejects invalid edits and never resurrects a deleted book', async () => {
  await saveImportedBook(book, new Blob(['book']), null)
  await expect(
    updateBookMetadata(book.id, { title: ' \n ', author: '', category: null }),
  ).rejects.toThrow('書名不能留白')
  await expect(
    updateBookMetadata(book.id, { title: 'a'.repeat(201), author: '', category: null }),
  ).rejects.toThrow('最多')
  expect(await listBooks()).toEqual([book])
  await deleteLocalBook(book.id)
  await expect(
    updateBookMetadata(book.id, { title: '修改', author: '', category: null }),
  ).rejects.toThrow('已被移除')
  expect(await listBooks()).toEqual([])
})

describe('book storage transactions', () => {
  it('preserves metadata, original bytes and cover across reopen', async () => {
    await saveImportedBook(book, new Blob(['book']), new Blob(['cover'], { type: 'image/png' }))
    expect(await listBooks()).toEqual([book])
    expect(await (await getBookFile(book.id))?.text()).toBe('book')
    expect(await (await getBookCover(book.id))?.text()).toBe('cover')
  })
  it('serializes concurrent imports of the same content into a single copy', async () => {
    const results = await Promise.all([
      saveImportedBook(book, new Blob(['book']), null),
      saveImportedBook({ ...book, id: 'different-id' }, new Blob(['book']), null),
    ])
    expect(results.filter((result) => result.added)).toHaveLength(1)
    expect(await listBooks()).toHaveLength(1)
    expect(await getBookFile('different-id')).toBeUndefined()
  })
  it('rolls back metadata if storing the binary file fails', async () => {
    // structuredClone cannot persist a function, simulating an IDB request failure.
    await expect(
      saveImportedBook(book, (() => undefined) as unknown as Blob, null),
    ).rejects.toThrow()
    const database = await openReaderDatabase()
    expect(await database.count('books')).toBe(0)
    expect(await database.count('bookFiles')).toBe(0)
    database.close()
  })
  it('removes all local data for only the selected book', async () => {
    await saveImportedBook(book, new Blob(['book']), new Blob(['cover']))
    await saveImportedBook(
      { ...book, id: 'book-b', fileHash: 'hash-b', createdAt: 2 },
      new Blob(['other']),
      null,
    )
    await deleteLocalBook('book-a')
    expect((await listBooks()).map((item) => item.id)).toEqual(['book-b'])
    expect(await getBookFile('book-a')).toBeUndefined()
    expect(await getBookCover('book-a')).toBeUndefined()
    expect(await (await getBookFile('book-b'))?.text()).toBe('other')
  })
})

it('saves series atomically, retains progress and clears volume when leaving a series', async () => {
  await saveImportedBook(book, new Blob(['book']), null)
  await saveImportedBook({ ...book, id: 'b', fileHash: 'b' }, new Blob(['b']), null)
  const db = await openReaderDatabase()
  const progress = {
    bookId: book.id,
    location: { format: 'epub' as const, cfi: 'epubcfi(/6/2)' },
    percentage: 0.68,
    updatedAt: 5,
  }
  await db.put('progress', progress, book.id)
  db.close()
  await assignSeries(' 山城 ', [
    { id: book.id, volume: 1 },
    { id: 'b', volume: 2 },
  ])
  expect((await listLibraryBooks()).find((b) => b.id === book.id)).toMatchObject({
    series: '山城',
    volume: 1,
    progress,
  })
  await expect(
    assignSeries('別套', [
      { id: book.id, volume: 3 },
      { id: 'missing', volume: 4 },
    ]),
  ).rejects.toThrow('未套用任何變更')
  await expect(
    assignSeries('別套', [
      { id: book.id, volume: 3 },
      { id: 'b', volume: NaN },
    ]),
  ).rejects.toThrow('集數')
  expect((await listBooks()).every((b) => b.series === '山城')).toBe(true)
  await updateBookMetadata(book.id, { title: '新書名', author: '', category: '奇幻' })
  expect((await listBooks()).find((b) => b.id === book.id)).toMatchObject({
    series: '山城',
    volume: 1,
  })
  await updateBookMetadata(book.id, {
    title: '新書名',
    author: '',
    category: '奇幻',
    series: '',
    volume: 1,
  })
  expect((await listLibraryBooks()).find((b) => b.id === book.id)).toMatchObject({
    series: null,
    volume: null,
    progress,
  })
  expect(await (await getBookFile(book.id))?.text()).toBe('book')
})
