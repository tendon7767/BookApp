import { afterEach, expect, it } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { DATABASE_NAME, openReaderDatabase, readPreferences } from './database'
import { associateCloudDownload, listCloudBooks, rememberCloudFiles } from './cloudRepository'
import type { DriveFile } from '../features/cloud/types'

const file: DriveFile = {
  id: 'remote',
  name: '書.txt',
  size: 3,
  version: '1',
  modifiedTime: '',
  mimeType: 'text/plain',
  canDownload: true,
}
afterEach(async () => {
  await deleteDB(DATABASE_NAME)
})
it('keeps accounts isolated and preserves local associations when cloud versions change', async () => {
  await rememberCloudFiles('a', [file])
  await associateCloudDownload('a', file, 'content-hash')
  await rememberCloudFiles('b', [{ ...file, name: '另一帳號.txt' }])
  await rememberCloudFiles('a', [{ ...file, name: '改名.txt', version: '2' }])
  expect(await listCloudBooks('a')).toEqual([
    {
      ...file,
      name: '改名.txt',
      version: '2',
      accountId: 'a',
      localBookId: 'content-hash',
      downloadedVersion: '1',
    },
  ])
  expect((await listCloudBooks('b'))[0].localBookId).toBeUndefined()
})
it('adds cloud stores to v4 without changing settings, book bytes or reading progress', async () => {
  const old = await openDB(DATABASE_NAME, 4, {
    upgrade(db) {
      db.createObjectStore('preferences')
      db.createObjectStore('books', { keyPath: 'id' })
      for (const name of ['bookFiles', 'bookCovers', 'progress', 'readerSettings', 'epubLocations'])
        db.createObjectStore(name)
    },
  })
  await old.put('preferences', { theme: 'graphite' }, 'app')
  await old.put(
    'bookFiles',
    { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'text/plain' },
    'local',
  )
  const progress = {
    bookId: 'local',
    location: { format: 'txt', characterOffset: 123 },
    percentage: 0.68,
    updatedAt: 1,
  }
  await old.put('progress', progress, 'local')
  old.close()
  const upgraded = await openReaderDatabase()
  expect(upgraded.version).toBe(6)
  expect(
    new Uint8Array(((await upgraded.get('bookFiles', 'local')) as { bytes: ArrayBuffer }).bytes),
  ).toEqual(new Uint8Array([1, 2, 3]))
  expect(await upgraded.get('progress', 'local')).toEqual(progress)
  expect(upgraded.objectStoreNames.contains('cloudBooks')).toBe(true)
  upgraded.close()
  expect(await readPreferences()).toEqual({ theme: 'graphite' })
})
