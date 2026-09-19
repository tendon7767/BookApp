import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { parsePreferences, type AppPreferences } from '../features/settings/preferences'
import type { BookMetadata, ReadingProgress } from '../domain/book'
import type { StoredBinary } from './binary'
import type { ReadingSettings } from '../features/reader/readingSettings'
import type { CloudBook, CloudPreferences } from '../features/cloud/types'
import type { SyncState } from '../features/cloud/syncModel'
import type { ReadingMarks } from '../domain/readingMarks'

interface ReaderDatabase extends DBSchema {
  syncState: { key: string; value: SyncState }
  cloudPreferences: { key: string; value: CloudPreferences }
  cloudBooks: { key: [string, string]; value: CloudBook; indexes: { 'by-account': string } }
  preferences: { key: string; value: AppPreferences }
  books: {
    key: string
    value: BookMetadata
    indexes: { 'by-hash': string; 'by-created': number }
  }
  bookFiles: { key: string; value: StoredBinary | Blob }
  bookCovers: { key: string; value: StoredBinary | Blob }
  progress: { key: string; value: ReadingProgress }
  epubLocations: { key: string; value: { fileHash: string; version: number; locations: string } }
  readerSettings: { key: string; value: { settings: ReadingSettings; updatedAt: number } }
  readingMarks: { key: string; value: ReadingMarks }
}
export const DATABASE_NAME = 'kanshu-local'
export const DATABASE_VERSION = 7

// Migrations only add stores; never recreate user data on update.
export function openReaderDatabase(name = DATABASE_NAME): Promise<IDBPDatabase<ReaderDatabase>> {
  return new Promise((resolve, reject) => {
    let abandoned = false
    const timer = setTimeout(() => {
      abandoned = true
      reject(new Error('開啟儲存空間逾時，請關閉其他「看書」視窗後重試。'))
    }, 5000)
    const fail = (error: unknown) => {
      abandoned = true
      clearTimeout(timer)
      reject(error)
    }
    try {
      const opening = openDB<ReaderDatabase>(name, DATABASE_VERSION, {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) database.createObjectStore('preferences')
          if (oldVersion < 2) {
            const books = database.createObjectStore('books', { keyPath: 'id' })
            books.createIndex('by-hash', 'fileHash', { unique: true })
            books.createIndex('by-created', 'createdAt')
            database.createObjectStore('bookFiles')
            database.createObjectStore('bookCovers')
          }
          if (oldVersion < 3) {
            database.createObjectStore('progress')
            database.createObjectStore('epubLocations')
          }
          if (oldVersion < 4) database.createObjectStore('readerSettings')
          if (oldVersion < 5) {
            database.createObjectStore('cloudPreferences')
            database
              .createObjectStore('cloudBooks', { keyPath: ['accountId', 'id'] })
              .createIndex('by-account', 'accountId')
          }
          if (oldVersion < 6) database.createObjectStore('syncState')
          if (oldVersion < 7) database.createObjectStore('readingMarks')
        },
        blocked() {
          fail(new Error('另一個「看書」視窗正在使用儲存空間，請關閉後重試。'))
        },
        blocking() {
          void opening.then((database) => database.close()).catch(() => undefined)
        },
      })
      void opening.then((database) => {
        clearTimeout(timer)
        if (abandoned) database.close()
        else resolve(database)
      }, fail)
    } catch (error) {
      fail(error)
    }
  })
}

export async function readPreferences(): Promise<AppPreferences> {
  const database = await openReaderDatabase()
  try {
    return parsePreferences(await database.get('preferences', 'app'))
  } finally {
    database.close()
  }
}

export async function writePreferences(preferences: AppPreferences): Promise<void> {
  const database = await openReaderDatabase()
  try {
    await database.put('preferences', parsePreferences(preferences), 'app')
  } finally {
    database.close()
  }
}

export async function writeShelfSort(patch: Pick<AppPreferences, 'librarySort' | 'seriesSort'>) {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction('preferences', 'readwrite')
    const current = parsePreferences(await tx.store.get('app'))
    await tx.store.put({ ...current, ...patch }, 'app')
    await tx.done
  } finally {
    db.close()
  }
}
