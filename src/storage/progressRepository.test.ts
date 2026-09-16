import { afterEach, expect, it } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { DATABASE_NAME, openReaderDatabase } from './database'
import {
  readProgress,
  saveProgress,
  readEpubLocations,
  saveEpubLocations,
} from './progressRepository'
import { deleteLocalBook } from './bookRepository'
import type { BookMetadata, ReadingProgress } from '../domain/book'

const book: BookMetadata = {
  id: 'a',
  title: '測試',
  originalTitle: '測試',
  author: '',
  format: 'epub',
  category: null,
  createdAt: 1,
  modifiedAt: 1,
  fileName: 'a.epub',
  fileHash: 'hash',
  fileSize: 1,
  hasCover: false,
}
const progress: ReadingProgress = {
  bookId: 'a',
  location: { format: 'epub', cfi: 'epubcfi(/6/2!/4/2/1:0)' },
  percentage: 0.5,
  updatedAt: 2,
}
afterEach(async () => {
  await deleteDB(DATABASE_NAME)
})

it('migrates a v2 library without changing its book bytes or preferences', async () => {
  const old = await openDB(DATABASE_NAME, 2, {
    upgrade(db) {
      db.createObjectStore('preferences')
      const books = db.createObjectStore('books', { keyPath: 'id' })
      books.createIndex('by-hash', 'fileHash', { unique: true })
      books.createIndex('by-created', 'createdAt')
      db.createObjectStore('bookFiles')
      db.createObjectStore('bookCovers')
    },
  })
  await old.put('books', book)
  await old.put(
    'bookFiles',
    { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'application/epub+zip' },
    'a',
  )
  await old.put('preferences', { theme: 'dark' }, 'app')
  old.close()
  const db = await openReaderDatabase()
  expect(await db.get('books', 'a')).toEqual(book)
  expect(await db.get('preferences', 'app')).toEqual({ theme: 'dark' })
  expect(await db.get('bookFiles', 'a')).toMatchObject({ bytes: new Uint8Array([1, 2, 3]).buffer })
  db.close()
})
it('preserves newer positions including intentional backward reading and deletes related data', async () => {
  const db = await openReaderDatabase()
  await db.put('books', book)
  db.close()
  await saveProgress(progress)
  await saveProgress({ ...progress, percentage: 0.2, updatedAt: 3 })
  await saveProgress({ ...progress, percentage: 0.9, updatedAt: 1 })
  expect((await readProgress('a'))?.percentage).toBe(0.2)
  await saveEpubLocations('a', 'hash', '["cfi"]')
  expect(await readEpubLocations('a', 'hash')).toBe('["cfi"]')
  expect(await readEpubLocations('a', 'different')).toBeUndefined()
  await deleteLocalBook('a')
  await saveProgress({ ...progress, updatedAt: 4 })
  await saveEpubLocations('a', 'hash', '["cfi"]')
  expect(await readProgress('a')).toBeUndefined()
  expect(await readEpubLocations('a', 'hash')).toBeUndefined()
})
it('rejects invalid percentages before writing', async () => {
  await expect(saveProgress({ ...progress, percentage: NaN })).rejects.toThrow()
  await expect(saveProgress({ ...progress, percentage: 1.2 })).rejects.toThrow()
})
