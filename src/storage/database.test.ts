import { afterEach, describe, expect, it } from 'vitest'
import { deleteDB, openDB } from 'idb'
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  openReaderDatabase,
  readPreferences,
  writePreferences,
} from './database'
import { parsePreferences } from '../features/settings/preferences'

afterEach(async () => {
  await deleteDB(DATABASE_NAME)
})

describe('local preferences and versioned storage', () => {
  it('starts with paper when there is no saved setting', async () => {
    expect(await readPreferences()).toEqual({ theme: 'paper' })
  })
  it('preserves settings across database close and reopen', async () => {
    await writePreferences({ theme: 'dark' })
    expect(await readPreferences()).toEqual({ theme: 'dark' })
    await writePreferences({ theme: 'light' })
    expect(await readPreferences()).toEqual({ theme: 'light' })
    for (const theme of ['graphite', 'mist', 'sage'] as const) {
      await writePreferences({ theme })
      expect(await readPreferences()).toEqual({ theme })
    }
  })
  it('migrates v1 without losing preferences and adds book stores', async () => {
    const original = await openDB(DATABASE_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('preferences')
      },
    })
    await original.put('preferences', { theme: 'dark' }, 'app')
    original.close()
    const reopened = await openReaderDatabase()
    expect(reopened.version).toBe(DATABASE_VERSION)
    expect(Array.from(reopened.objectStoreNames)).toEqual([
      'bookCovers',
      'bookFiles',
      'books',
      'cloudBooks',
      'cloudPreferences',
      'epubLocations',
      'preferences',
      'progress',
      'readerSettings',
      'syncState',
    ])
    expect(await reopened.get('preferences', 'app')).toEqual({ theme: 'dark' })
    reopened.close()
  })
  it('refuses a newer database version without erasing its data', async () => {
    const future = await openDB(DATABASE_NAME, DATABASE_VERSION + 1, {
      upgrade(database) {
        database.createObjectStore('preferences')
      },
    })
    await future.put('preferences', { theme: 'dark' }, 'app')
    future.close()
    await expect(openReaderDatabase()).rejects.toMatchObject({ name: 'VersionError' })
    const reopened = await openDB(DATABASE_NAME, DATABASE_VERSION + 1)
    expect(await reopened.get('preferences', 'app')).toEqual({ theme: 'dark' })
    reopened.close()
  })
  it.each([undefined, null, 'dark', {}, { theme: 'unknown' }, { theme: 42 }])(
    'falls back safely for invalid data: %j',
    (value) => {
      expect(parsePreferences(value)).toEqual({ theme: 'paper' })
    },
  )
})
