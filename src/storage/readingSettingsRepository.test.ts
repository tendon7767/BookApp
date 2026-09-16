import { afterEach, expect, it } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { DATABASE_NAME, openReaderDatabase, readPreferences, writePreferences } from './database'
import { defaultReadingSettings, parseReadingSettings } from '../features/reader/readingSettings'
import { readReadingSettings, writeReadingSettings } from './readingSettingsRepository'
import { deleteLocalBook } from './bookRepository'
import type { BookMetadata } from '../domain/book'

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
afterEach(async () => {
  await deleteDB(DATABASE_NAME)
})
it('normalizes untrusted settings and bounds layout values', () => {
  expect(
    parseReadingSettings(
      {
        fontFamily: 'url(https://example.org)',
        fontSize: 500,
        lineHeight: 0,
        paragraphSpacing: NaN,
        margin: -1,
        theme: 'unknown',
        textColor: 'red; display:none',
        backgroundColor: '#AbCdEf',
      },
      'dark',
    ),
  ).toEqual({
    ...defaultReadingSettings,
    fontSize: 36,
    lineHeight: 1.2,
    margin: 8,
    theme: 'dark',
    backgroundColor: '#abcdef',
  })
  expect(parseReadingSettings(null, 'light')).toEqual({ ...defaultReadingSettings, theme: 'light' })
  expect(parseReadingSettings(null, 'graphite').theme).toBe('dark')
  expect(parseReadingSettings(null, 'mist').theme).toBe('light')
  expect(parseReadingSettings(null, 'sage').theme).toBe('paper')
  expect(parseReadingSettings({ theme: 'paper' }, 'graphite').theme).toBe('paper')
})
it('migrates v3 preserving books and exact CFI progress', async () => {
  const old = await openDB(DATABASE_NAME, 3, {
    upgrade(db) {
      db.createObjectStore('books', { keyPath: 'id' })
      db.createObjectStore('progress')
    },
  })
  await old.put('books', book)
  const progress = {
    bookId: 'a',
    location: { format: 'epub', cfi: 'epubcfi(/6/2!/4/2/1:5)' },
    percentage: 0.2,
    updatedAt: 1,
  }
  await old.put('progress', progress, 'a')
  old.close()
  const db = await openReaderDatabase()
  expect(await db.get('books', 'a')).toEqual(book)
  expect(await db.get('progress', 'a')).toEqual(progress)
  expect(db.objectStoreNames.contains('readerSettings')).toBe(true)
  db.close()
})
it('persists per-book settings and removes them with the book without resurrecting deleted records', async () => {
  const db = await openReaderDatabase()
  await db.put('books', book)
  db.close()
  const settings = {
    ...defaultReadingSettings,
    fontSize: 27,
    theme: 'dark' as const,
    textColor: '#eeeeee',
  }
  await writeReadingSettings('a', settings)
  expect(await readReadingSettings('a', 'paper')).toEqual(settings)
  expect(await readReadingSettings('b', 'light')).toEqual({
    ...defaultReadingSettings,
    theme: 'light',
  })
  await deleteLocalBook('a')
  await writeReadingSettings('a', settings)
  expect(await readReadingSettings('a', 'paper')).toEqual(defaultReadingSettings)
})

it('uses app defaults across formats while retaining saved per-book settings and progress', async () => {
  const db = await openReaderDatabase()
  await db.put('books', book)
  const progress = {
    bookId: book.id,
    location: { format: 'epub' as const, cfi: 'epubcfi(/6/2)' },
    percentage: 0.68,
    updatedAt: 1,
  }
  await db.put('progress', progress, book.id)
  db.close()
  const defaults = {
    ...defaultReadingSettings,
    fontFamily: 'sans' as const,
    fontSize: 25,
    lineHeight: 2,
    margin: 32,
    textColor: '#eeeeee',
    backgroundColor: '#112233',
    theme: 'dark' as const,
  }
  await writePreferences({ theme: 'paper', readingDefaults: defaults })
  expect(await readReadingSettings('a', 'paper')).toEqual(defaults)
  expect(await readReadingSettings('txt-book', 'paper')).toEqual(defaults)
  await writeReadingSettings('a', { ...defaults, fontSize: 30 })
  await writePreferences({
    ...(await readPreferences()),
    theme: 'light',
    readingDefaults: { ...defaults, fontSize: 22 },
  })
  expect((await readReadingSettings('a', 'light')).fontSize).toBe(30)
  expect((await readReadingSettings('txt-book', 'light')).fontSize).toBe(22)
  const reopened = await openReaderDatabase()
  expect(await reopened.get('progress', book.id)).toEqual(progress)
  reopened.close()
})
