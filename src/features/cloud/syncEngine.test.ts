import { afterEach, expect, it } from 'vitest'
import { deleteDB } from 'idb'
import { DATABASE_NAME, readPreferences, writePreferences } from '../../storage/database'
import {
  deleteLocalBook,
  getBookFile,
  listBooks,
  saveImportedBook,
  updateBookMetadata,
} from '../../storage/bookRepository'
import { captureLocal, readSyncState } from '../../storage/syncRepository'
import { defaultReadingSettings } from '../reader/readingSettings'
import type { BookMetadata } from '../../domain/book'
import { downloadBook, resolveConflict, synchronize, targetKey } from './syncEngine'
import { parseSnapshot } from './syncModel'
import type { RemoteEntry, SyncDrive } from './syncDrive'

const text = '第一章\n測試小說'
const bytes = new TextEncoder().encode(text)
const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
  n.toString(16).padStart(2, '0'),
).join('')
const book: BookMetadata = {
  id,
  fileHash: id,
  title: '小說',
  originalTitle: '小說',
  author: '',
  format: 'txt',
  category: null,
  createdAt: 1,
  modifiedAt: 1,
  fileName: '小說.txt',
  fileSize: bytes.length,
  hasCover: false,
}
const target = { accountId: 'a', id: 'folder', name: '看書' }
const signal = new AbortController().signal
function fakeDrive() {
  const entries = new Map<string, RemoteEntry>()
  const bodies = new Map<string, Blob>()
  let sequence = 0
  let loseResponse = false
  const uploadIds: string[] = []
  const drive = {
    entries: async () => [...entries.values()],
    generateId: async () => 'file-' + ++sequence,
    blob: async (id: string) => bodies.get(id)!,
    upload: async (
      id: string,
      _parent: string,
      name: string,
      body: Blob,
      appProperties: Record<string, string>,
    ) => {
      uploadIds.push(id)
      entries.set(id, {
        id,
        name,
        mimeType: body.type,
        appProperties,
        createdTime: new Date().toISOString(),
      })
      bodies.set(id, body)
      if (loseResponse && appProperties.kanshu === 'snapshot-v1') {
        loseResponse = false
        throw new TypeError('lost response')
      }
    },
  } as unknown as SyncDrive
  return {
    drive,
    entries,
    bodies,
    uploadIds,
    loseNextSnapshotResponse: () => {
      loseResponse = true
    },
  }
}
afterEach(() => deleteDB(DATABASE_NAME))
it('backs up originals once, updates settings without reupload, and restores onto an empty device', async () => {
  const fake = fakeDrive()
  await saveImportedBook(book, new Blob([bytes]), null)
  await writePreferences({ theme: 'graphite', readingDefaults: defaultReadingSettings })
  await synchronize(fake.drive, target, signal, () => {})
  const originalUploads = fake.uploadIds.filter(
    (id) => fake.entries.get(id)?.appProperties?.kanshu === 'book-v1',
  )
  expect(originalUploads).toHaveLength(1)
  await updateBookMetadata(id, { title: '改名', author: '作者', category: '小說' })
  await synchronize(fake.drive, target, signal, () => {})
  expect(
    fake.uploadIds.filter((id) => fake.entries.get(id)?.appProperties?.kanshu === 'book-v1'),
  ).toHaveLength(1)
  for (const entry of fake.entries.values())
    if (entry.appProperties?.kanshu === 'snapshot-v1')
      expect(parseSnapshot(JSON.parse(await fake.bodies.get(entry.id)!.text())).assets[id].id).toBe(
        originalUploads[0],
      )
  await deleteDB(DATABASE_NAME)
  await synchronize(fake.drive, target, signal, () => {})
  const restored = (await listBooks())[0]
  expect(restored).toMatchObject({
    title: '改名',
    author: '作者',
    category: '小說',
    downloaded: false,
  })
  expect((await readPreferences()).theme).toBe('graphite')
  expect(await getBookFile(id)).toBeUndefined()
  await downloadBook(fake.drive, restored, 'a', signal, () => {})
  expect(await (await getBookFile(id))?.text()).toBe(text)
})
it('retries a committed snapshot with its persisted ID and preserves newer local edits', async () => {
  const fake = fakeDrive()
  await saveImportedBook(book, new Blob([bytes]), null)
  fake.loseNextSnapshotResponse()
  await expect(synchronize(fake.drive, target, signal, () => {})).rejects.toThrow('lost response')
  const pending = (await readSyncState(targetKey(target)))!.pending!
  expect(pending).toBeDefined()
  await updateBookMetadata(id, { title: '離線修改', author: '', category: null })
  await synchronize(fake.drive, target, signal, () => {})
  expect(fake.uploadIds.filter((id) => id === pending.id)).toHaveLength(2)
  expect((await readSyncState(targetKey(target)))!.pending).toBeUndefined()
  await deleteDB(DATABASE_NAME)
  await synchronize(fake.drive, target, signal, () => {})
  expect((await listBooks())[0].title).toBe('離線修改')
})
it('keeps tombstones and originals so a synchronized deletion can be undone', async () => {
  const fake = fakeDrive()
  await saveImportedBook(book, new Blob([bytes]), null)
  await synchronize(fake.drive, target, signal, () => {})
  await deleteLocalBook(id)
  await synchronize(fake.drive, target, signal, () => {})
  await deleteDB(DATABASE_NAME)
  await synchronize(fake.drive, target, signal, () => {})
  expect(await listBooks()).toHaveLength(0)
  await resolveConflict(target, id + '/alive', true)
  const restored = (await listBooks())[0]
  expect(restored.downloaded).toBe(false)
  await downloadBook(fake.drive, restored, 'a', signal, () => {})
  expect(await (await getBookFile(id))?.text()).toBe(text)
  expect((await captureLocal(targetKey(target))).assets[id]).toBeDefined()
})
