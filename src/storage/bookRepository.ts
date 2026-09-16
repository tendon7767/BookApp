import type { BookEdits, BookMetadata, LibraryBook } from '../domain/book'
import { normalizeSeries } from '../domain/series'
import { openReaderDatabase } from './database'
import { decodeBinary, encodeBinary, type StoredBinary } from './binary'

export async function listBooks(): Promise<BookMetadata[]> {
  const database = await openReaderDatabase()
  try {
    const books = await database.getAllFromIndex('books', 'by-created')
    return books.reverse()
  } finally {
    database.close()
  }
}

// The shelf never reads bookFiles or covers into memory just to filter/sort books.
export async function listLibraryBooks(): Promise<LibraryBook[]> {
  const database = await openReaderDatabase()
  try {
    const tx = database.transaction(['books', 'progress'], 'readonly')
    const [books, progress] = await Promise.all([
      tx.objectStore('books').getAll(),
      tx.objectStore('progress').getAll(),
    ])
    await tx.done
    const byId = new Map(progress.map((item) => [item.bookId, item]))
    return books.map((book) => ({ ...book, progress: byId.get(book.id) }))
  } finally {
    database.close()
  }
}

export async function updateBookMetadata(id: string, edits: BookEdits): Promise<BookMetadata> {
  const title = edits.title.trim()
  const author = edits.author.trim()
  const category = edits.category?.trim() || null
  if (!title) throw new Error('書名不能留白。')
  if (title.length > 200 || author.length > 120 || (category?.length ?? 0) > 60)
    throw new Error('書名最多 200 字、作者 120 字、分類 60 字。')
  const seriesFields =
    edits.series !== undefined ? normalizeSeries(edits.series, edits.volume ?? null) : {}
  const database = await openReaderDatabase()
  try {
    const tx = database.transaction('books', 'readwrite')
    void tx.done.catch(() => undefined)
    const book = await tx.store.get(id)
    if (!book) {
      await tx.done
      throw new Error('這本書已被移除，請返回書架重新整理。')
    }
    // Patch only editable fields inside the transaction; keep the original and binary identity.
    const updated = {
      ...book,
      title,
      author,
      category,
      ...seriesFields,
      modifiedAt: Math.max(Date.now(), book.modifiedAt + 1),
    }
    await tx.store.put(updated)
    await tx.done
    return updated
  } finally {
    database.close()
  }
}

export async function findBookByHash(hash: string): Promise<BookMetadata | undefined> {
  const database = await openReaderDatabase()
  try {
    return await database.getFromIndex('books', 'by-hash', hash)
  } finally {
    database.close()
  }
}

export async function saveImportedBook(
  book: BookMetadata,
  file: Blob | StoredBinary,
  cover: Blob | null,
) {
  // Finish all non-IDB async work before starting the transaction (important on Safari).
  const [binaryFile, binaryCover] = await Promise.all([
    encodeBinary(file),
    cover ? encodeBinary(cover) : null,
  ])
  const database = await openReaderDatabase()
  const transaction = database.transaction(['books', 'bookFiles', 'bookCovers'], 'readwrite')
  // Observe an aborted transaction even when one of its requests rejects first.
  void transaction.done.catch(() => undefined)
  try {
    const existing = await transaction.objectStore('books').index('by-hash').get(book.fileHash)
    if (existing) {
      const missing = !(await transaction.objectStore('bookFiles').getKey(existing.id))
      if (missing) {
        await transaction.objectStore('bookFiles').put(binaryFile, existing.id)
        if (binaryCover) await transaction.objectStore('bookCovers').put(binaryCover, existing.id)
        await transaction.objectStore('books').put({ ...existing, downloaded: true })
      }
      await transaction.done
      return { book: missing ? { ...existing, downloaded: true } : existing, added: false }
    }
    await transaction.objectStore('books').add(book)
    await transaction.objectStore('bookFiles').add(binaryFile, book.id)
    if (binaryCover) await transaction.objectStore('bookCovers').add(binaryCover, book.id)
    await transaction.done
    return { book, added: true }
  } catch (error) {
    // Synchronous DataCloneError does not abort IDB automatically.
    try {
      transaction.abort()
    } catch {
      /* A failed request may already have aborted it. */
    }
    await transaction.done.catch(() => undefined)
    throw error
  } finally {
    database.close()
  }
}

export async function removeBookDownload(id: string) {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(['books', 'bookFiles', 'epubLocations'], 'readwrite')
    const book = await tx.objectStore('books').get(id)
    if (book?.cloudSource) {
      await tx.objectStore('bookFiles').delete(id)
      await tx.objectStore('epubLocations').delete(id)
      await tx.objectStore('books').put({ ...book, downloaded: false })
    }
    await tx.done
  } finally {
    db.close()
  }
}

export async function getBookFile(id: string): Promise<Blob | undefined> {
  const database = await openReaderDatabase()
  try {
    return decodeBinary(await database.get('bookFiles', id))
  } finally {
    database.close()
  }
}

export async function getBookCover(id: string): Promise<Blob | undefined> {
  const database = await openReaderDatabase()
  try {
    return decodeBinary(await database.get('bookCovers', id))
  } finally {
    database.close()
  }
}

export async function deleteLocalBook(id: string): Promise<void> {
  return deleteLocalBooks([id])
}

export async function deleteLocalBooks(ids: string[]): Promise<void> {
  const database = await openReaderDatabase()
  const transaction = database.transaction(
    ['books', 'bookFiles', 'bookCovers', 'progress', 'epubLocations', 'readerSettings'],
    'readwrite',
  )
  void transaction.done.catch(() => undefined)
  try {
    for (const id of new Set(ids)) {
      await transaction.objectStore('books').delete(id)
      await transaction.objectStore('bookFiles').delete(id)
      await transaction.objectStore('bookCovers').delete(id)
      await transaction.objectStore('progress').delete(id)
      await transaction.objectStore('epubLocations').delete(id)
      await transaction.objectStore('readerSettings').delete(id)
    }
    await transaction.done
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      /* Already aborted or completed. */
    }
    await transaction.done.catch(() => undefined)
    throw error
  } finally {
    database.close()
  }
}

export async function categorizeBooks(ids: string[], value: string): Promise<BookMetadata[]> {
  const category = value.trim() || null
  if ((category?.length ?? 0) > 60) throw new Error('分類最多 60 字。')
  const db = await openReaderDatabase()
  const tx = db.transaction('books', 'readwrite')
  void tx.done.catch(() => undefined)
  try {
    const updated: BookMetadata[] = []
    for (const id of new Set(ids)) {
      const book = await tx.store.get(id)
      if (!book) throw new Error('部分書籍已被移除，未套用任何變更。請重新選取。')
      const next = { ...book, category, modifiedAt: Math.max(Date.now(), book.modifiedAt + 1) }
      await tx.store.put(next)
      updated.push(next)
    }
    await tx.done
    return updated
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
