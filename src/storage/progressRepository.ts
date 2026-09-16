import type { ReadingProgress } from '../domain/book'
import { openReaderDatabase } from './database'

export async function readProgress(bookId: string) {
  const db = await openReaderDatabase()
  try {
    return await db.get('progress', bookId)
  } finally {
    db.close()
  }
}

export async function saveProgress(progress: ReadingProgress) {
  if (!Number.isFinite(progress.percentage) || progress.percentage < 0 || progress.percentage > 1)
    throw new Error('無效的閱讀進度')
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(['books', 'progress'], 'readwrite')
    const exists = await tx.objectStore('books').get(progress.bookId)
    const previous = await tx.objectStore('progress').get(progress.bookId)
    // A late write must neither resurrect a deleted book nor replace a newer position.
    if (exists && (!previous || previous.updatedAt <= progress.updatedAt))
      await tx.objectStore('progress').put(progress, progress.bookId)
    await tx.done
  } finally {
    db.close()
  }
}

export async function readEpubLocations(bookId: string, fileHash: string) {
  const db = await openReaderDatabase()
  try {
    const cache = await db.get('epubLocations', bookId)
    return cache?.fileHash === fileHash && cache.version === 1 ? cache.locations : undefined
  } finally {
    db.close()
  }
}

export async function saveEpubLocations(bookId: string, fileHash: string, locations: string) {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(['books', 'epubLocations'], 'readwrite')
    if (await tx.objectStore('books').get(bookId))
      await tx.objectStore('epubLocations').put({ fileHash, version: 1, locations }, bookId)
    await tx.done
  } finally {
    db.close()
  }
}
