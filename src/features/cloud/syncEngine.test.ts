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
import {
  adoptCloudOriginal,
  downloadBook,
  purgeCloudOriginals,
  resolveConflict,
  SNAPSHOTS_PER_DEVICE,
  synchronize,
  targetKey,
} from './syncEngine'
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
  const parents = new Map<string, string>()
  const bodies = new Map<string, Blob>()
  const trashed = new Set<string>()
  let sequence = 0
  let loseResponse = false
  const uploadIds: string[] = []
  const drive = {
    entries: async (parent: string) =>
      [...entries.values()].filter((entry) => parents.get(entry.id) === parent),
    generateId: async () => 'file-' + ++sequence,
    blob: async (id: string) => bodies.get(id)!,
    createFolder: async (parent: string, name: string, appProperties: Record<string, string>) => {
      const id = 'dir-' + ++sequence
      const entry: RemoteEntry = {
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties,
        createdTime: new Date(sequence).toISOString(),
      }
      entries.set(id, entry)
      parents.set(id, parent)
      return entry
    },
    move: async (id: string, _from: string, to: string) => {
      parents.set(id, to)
    },
    mark: async (id: string, appProperties: Record<string, string>) => {
      entries.set(id, { ...entries.get(id)!, appProperties })
    },
    trash: async (id: string) => {
      trashed.add(id)
      entries.delete(id)
      parents.delete(id)
    },
    upload: async (
      id: string,
      parent: string,
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
        createdTime: new Date(++sequence).toISOString(),
      })
      parents.set(id, parent)
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
    parents,
    bodies,
    trashed,
    uploadIds,
    kind: (kanshu: string) =>
      [...entries.values()].filter((entry) => entry.appProperties?.kanshu === kanshu),
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

it('keeps book originals beside the shelf folder and backups in its data subfolder', async () => {
  const fake = fakeDrive()
  await saveImportedBook(book, new Blob([bytes]), null)
  await synchronize(fake.drive, target, signal, () => {})
  const data = fake.kind('data-v1')[0]
  expect(data.name).toBe('備份資料')
  expect(fake.parents.get(data.id)).toBe(target.id)
  expect(fake.parents.get(fake.kind('book-v1')[0].id)).toBe(target.id)
  expect(fake.parents.get(fake.kind('snapshot-v1')[0].id)).toBe(data.id)
  // A backup left in the shelf folder by an older version moves in on the next sync.
  fake.parents.set(fake.kind('snapshot-v1')[0].id, target.id)
  await synchronize(fake.drive, target, signal, () => {})
  for (const entry of fake.kind('snapshot-v1')) expect(fake.parents.get(entry.id)).toBe(data.id)
})
it('keeps only the newest backups per device and trashes the rest', async () => {
  const fake = fakeDrive()
  await saveImportedBook(book, new Blob([bytes]), null)
  for (let round = 0; round < SNAPSHOTS_PER_DEVICE + 3; round++) {
    await updateBookMetadata(id, { title: '第 ' + round + ' 次', author: '', category: null })
    await synchronize(fake.drive, target, signal, () => {})
  }
  const kept = fake.kind('snapshot-v1')
  expect(kept).toHaveLength(SNAPSHOTS_PER_DEVICE)
  expect(fake.trashed.size).toBeGreaterThan(0)
  const generations = kept.map((entry) => Number(entry.appProperties!.generation))
  expect(Math.min(...generations)).toBeGreaterThan(3)
  await deleteDB(DATABASE_NAME)
  await synchronize(fake.drive, target, signal, () => {})
  expect((await listBooks())[0].title).toBe('第 ' + (SNAPSHOTS_PER_DEVICE + 2) + ' 次')
})
it('adopts a file dropped into the shelf folder and trashes originals on request', async () => {
  const fake = fakeDrive()
  await saveImportedBook(book, new Blob([bytes]), null)
  await synchronize(fake.drive, target, signal, () => {})
  const original = fake.kind('book-v1')[0]
  await purgeCloudOriginals(fake.drive, target, [id], signal)
  expect(fake.trashed.has(original.id)).toBe(true)
  expect((await readSyncState(targetKey(target)))!.assets[id]).toBeUndefined()
  await adoptCloudOriginal(fake.drive, target, id, 'dropped-file', signal)
  expect((await readSyncState(targetKey(target)))!.assets[id]).toEqual({ id: 'dropped-file' })
})
