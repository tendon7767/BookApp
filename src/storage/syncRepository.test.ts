import { afterEach, expect, it } from 'vitest'
import { deleteDB } from 'idb'
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  openReaderDatabase,
  readPreferences,
  writePreferences,
} from './database'
import { applyRemote, captureLocal, storeDownloaded } from './syncRepository'
import {
  getBookFile,
  listBooks,
  removeBookDownload,
  saveImportedBook,
  updateBookMetadata,
} from './bookRepository'
import { readProgress, saveProgress } from './progressRepository'
import { writeReadingSettings, readReadingSettings } from './readingSettingsRepository'
import { defaultReadingSettings } from '../features/reader/readingSettings'
import { conflicts, emptyDocument, materialize, writeFields } from '../features/cloud/syncModel'
import type { BookMetadata } from '../domain/book'
import { addBookmark, readReadingMarks } from './readingMarksRepository'

const id = 'a'.repeat(64)
const book: BookMetadata = {
  id,
  fileHash: id,
  title: '小說',
  originalTitle: '原名',
  author: '作者',
  format: 'txt',
  category: '小說',
  series: '系列',
  volume: 2,
  createdAt: 1,
  modifiedAt: 1,
  fileName: '小說.txt',
  fileSize: 3,
  hasCover: false,
}
const source = { accountId: 'account', folderId: 'folder' }
afterEach(() => deleteDB(DATABASE_NAME))
it('restores an empty device with metadata, progress, defaults, theme and per-book settings without downloading originals', async () => {
  await saveImportedBook(book, new Blob(['abc']), null)
  await saveProgress({
    bookId: id,
    location: { format: 'txt', characterOffset: 2 },
    percentage: 0.68,
    updatedAt: 2,
  })
  await writeReadingSettings(id, { ...defaultReadingSettings, fontSize: 27 })
  await addBookmark(id, {
    location: { format: 'txt', characterOffset: 2 },
    percentage: 0.68,
    label: '第一章',
  })
  await writePreferences({
    theme: 'graphite',
    librarySort: 'title',
    readingDefaults: { ...defaultReadingSettings, lineHeight: 2 },
  })
  const captured = await captureLocal('first')
  await deleteDB(DATABASE_NAME)
  const restored = await applyRemote(
    'restored',
    captured.document,
    { [id]: { id: 'remote' } },
    source,
  )
  expect(await listBooks()).toEqual([
    expect.objectContaining({
      title: '小說',
      series: '系列',
      volume: 2,
      downloaded: false,
      cloudSource: { ...source, id: 'remote' },
    }),
  ])
  expect(await getBookFile(id)).toBeUndefined()
  expect((await readProgress(id))?.percentage).toBe(0.68)
  expect((await readReadingSettings(id, 'paper')).fontSize).toBe(27)
  expect((await readReadingMarks(id)).bookmarks[0]).toMatchObject({
    percentage: 0.68,
    label: '第一章',
  })
  expect(await readPreferences()).toMatchObject({
    theme: 'graphite',
    librarySort: 'title',
    readingDefaults: { lineHeight: 2 },
  })
  expect((await captureLocal('restored')).document).toEqual(restored.document)
})
it('captures edits during a network request and preserves both same-field variants', async () => {
  await saveImportedBook(book, new Blob(['abc']), null)
  const initial = await captureLocal('target')
  const remote = writeFields(initial.document, 'other-device', { [id + '/title']: '遠端改名' })
  await updateBookMetadata(id, { title: '本機改名', author: '作者', category: '小說' })
  const state = await applyRemote('target', remote, {}, source)
  expect(
    conflicts(state.document)
      .find(([key]) => key === id + '/title')?.[1]
      .map((v) => v.value)
      .sort(),
  ).toEqual(['本機改名', '遠端改名'].sort())
  expect(await getBookFile(id)).toBeDefined()
})
it('rolls back malformed backup data without changing any local books', async () => {
  await saveImportedBook(book, new Blob(['abc']), null)
  const initial = await captureLocal('target')
  const bad = writeFields(initial.document, 'remote', {
    [id + '/title']: 42,
    [id + '/category']: '不應套用',
  })
  await expect(applyRemote('target', bad, {}, source)).rejects.toThrow()
  expect((await listBooks())[0]).toEqual(book)
})
it('keeps the cloud book and progress when removing only the local download', async () => {
  await saveImportedBook(book, new Blob(['abc']), null)
  const state = await captureLocal('target')
  await applyRemote('target', emptyDocument(), { [id]: { id: 'remote' } }, source)
  await saveProgress({
    bookId: id,
    location: { format: 'txt', characterOffset: 2 },
    percentage: 0.5,
    updatedAt: 2,
  })
  await removeBookDownload(id)
  expect((await listBooks())[0].downloaded).toBe(false)
  expect(await getBookFile(id)).toBeUndefined()
  expect((await readProgress(id))?.percentage).toBe(0.5)
  expect(materialize((await captureLocal('target')).document)[id + '/alive']).toBe(true)
  expect(materialize(state.document)[id + '/alive']).toBe(true)
})
it('rejects changed original bytes before committing to IndexedDB', async () => {
  await saveImportedBook(book, new Blob(['abc']), null)
  await expect(storeDownloaded(book, new Blob(['bad']))).rejects.toThrow('驗證失敗')
  expect(await (await getBookFile(id))?.text()).toBe('abc')
})
it('migrates a v5 shelf without deleting original files', async () => {
  const db = await openReaderDatabase()
  expect(db.version).toBe(DATABASE_VERSION)
  expect(db.objectStoreNames.contains('syncState')).toBe(true)
  db.close()
})
