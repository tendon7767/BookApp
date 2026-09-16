import type { BookMetadata } from '../domain/book'
import { normalizeSeries, type SeriesAssignment } from '../domain/series'
import { openReaderDatabase } from './database'

export async function assignSeries(
  name: string,
  entries: SeriesAssignment[],
): Promise<BookMetadata[]> {
  const edits = new Map(entries.map(({ id, volume }) => [id, normalizeSeries(name, volume)]))
  const db = await openReaderDatabase()
  const tx = db.transaction('books', 'readwrite')
  void tx.done.catch(() => undefined)
  try {
    const result: BookMetadata[] = []
    for (const [id, fields] of edits) {
      const book = await tx.store.get(id)
      if (!book) throw new Error('部分書籍已被移除，未套用任何變更。請重新選取。')
      const updated = { ...book, ...fields, modifiedAt: Math.max(Date.now(), book.modifiedAt + 1) }
      await tx.store.put(updated)
      result.push(updated)
    }
    await tx.done
    return result
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* Already aborted. */
    }
    await tx.done.catch(() => undefined)
    throw error
  } finally {
    db.close()
  }
}
