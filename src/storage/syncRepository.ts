import { openReaderDatabase } from './database'
import {
  captureChanges,
  emptyDocument,
  materialize,
  mergeDocuments,
  writeFields,
  type Json,
  type SyncDocument,
  type SyncState,
  type Asset,
} from '../features/cloud/syncModel'
import type { BookMetadata, ReadingProgress } from '../domain/book'
import { parsePreferences } from '../features/settings/preferences'
import { parseReadingSettings, type ReadingSettings } from '../features/reader/readingSettings'
import type { ReadingMarks } from '../domain/readingMarks'

const stores = [
  'books',
  'progress',
  'readerSettings',
  'preferences',
  'syncState',
  'bookFiles',
  'bookCovers',
  'epubLocations',
  'readingMarks',
] as const
type Database = Awaited<ReturnType<typeof openReaderDatabase>>
type Transaction = ReturnType<Database['transaction']>
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json
const editable = ['title', 'author', 'category', 'series', 'volume'] as const
async function localFields(tx: Transaction): Promise<Record<string, Json>> {
  const fields: Record<string, Json> = {}
  const books = await tx.objectStore('books').getAll()
  for (const b of books) {
    const key = b.fileHash + '/'
    fields[key + 'alive'] = true
    fields[key + 'core'] = json({
      originalTitle: b.originalTitle,
      format: b.format,
      fileName: b.fileName,
      fileSize: b.fileSize,
      createdAt: b.createdAt,
      hasCover: b.hasCover,
    })
    for (const field of editable) fields[key + field] = b[field] ?? null
    const progress = await tx.objectStore('progress').get(b.id)
    if (progress)
      fields[key + 'progress'] = json({
        location: progress.location,
        percentage: progress.percentage,
        updatedAt: progress.updatedAt,
      })
    const settings = await tx.objectStore('readerSettings').get(b.id)
    if (settings)
      for (const [field, value] of Object.entries(settings.settings))
        fields[key + 'setting' + field] = value
    const marks = await tx.objectStore('readingMarks').get(b.id)
    if (marks) fields[key + 'marks'] = json(marks)
  }
  const app = await tx.objectStore('preferences').get('app')
  if (app) {
    fields['app/theme'] = app.theme
    if (app.librarySort) fields['app/librarySort'] = app.librarySort
    if (app.seriesSort) fields['app/seriesSort'] = app.seriesSort
    if (app.readingDefaults)
      for (const [field, value] of Object.entries(app.readingDefaults))
        fields['app/default' + field] = value
  }
  return fields
}
function newState(): SyncState {
  return {
    device: crypto.randomUUID(),
    generation: 0,
    document: emptyDocument(),
    baseline: {},
    assets: {},
  }
}
export async function readSyncState(key: string) {
  const db = await openReaderDatabase()
  try {
    return await db.get('syncState', key)
  } finally {
    db.close()
  }
}
export async function saveSyncState(key: string, state: SyncState) {
  const db = await openReaderDatabase()
  try {
    await db.put('syncState', state, key)
  } finally {
    db.close()
  }
}
export async function captureLocal(key: string): Promise<SyncState> {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(stores, 'readwrite')
    const state = captureChanges(
      (await tx.objectStore('syncState').get(key)) ?? newState(),
      await localFields(tx),
    )
    await tx.objectStore('syncState').put(state, key)
    await tx.done
    return state
  } finally {
    db.close()
  }
}
function bookFromFields(
  hash: string,
  fields: Record<string, Json>,
  previous?: BookMetadata,
): BookMetadata {
  const core = fields[hash + '/core'] as Partial<BookMetadata> | undefined
  if (
    !core ||
    (core.format !== 'epub' && core.format !== 'txt') ||
    typeof core.originalTitle !== 'string' ||
    typeof core.fileName !== 'string' ||
    !Number.isFinite(core.createdAt) ||
    !Number.isSafeInteger(core.fileSize) ||
    core.fileSize! <= 0 ||
    core.fileSize! > 50 * 1024 * 1024
  )
    throw new Error('備份書籍資料不完整，未套用變更。')
  const get = (name: string) => fields[hash + '/' + name]
  if (typeof get('title') !== 'string' || typeof get('author') !== 'string')
    throw new Error('備份書名或作者無效。')
  for (const key of ['category', 'series'])
    if (get(key) !== null && get(key) !== undefined && typeof get(key) !== 'string')
      throw new Error('備份分類無效。')
  if (
    get('volume') != null &&
    (typeof get('volume') !== 'number' || !Number.isFinite(get('volume')))
  )
    throw new Error('備份集數無效。')
  return {
    ...previous,
    id: previous?.id ?? hash,
    fileHash: hash,
    originalTitle: core.originalTitle,
    format: core.format,
    fileName: core.fileName,
    fileSize: core.fileSize!,
    createdAt: core.createdAt!,
    hasCover: core.hasCover === true,
    modifiedAt: Date.now(),
    title: get('title') as string,
    author: get('author') as string,
    category: get('category') as string | null,
    series: (get('series') ?? null) as string | null,
    volume: (get('volume') ?? null) as number | null,
  }
}
function settingsFromFields(
  fields: Record<string, Json>,
  prefix: string,
): ReadingSettings | undefined {
  const entries = Object.entries(fields)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value])
  return entries.some(([, value]) => value !== null)
    ? parseReadingSettings(Object.fromEntries(entries))
    : undefined
}
function validateProgress(value: Json, book: BookMetadata): ReadingProgress {
  const p = value as unknown as ReadingProgress
  if (
    !p ||
    !Number.isFinite(p.percentage) ||
    p.percentage < 0 ||
    p.percentage > 1 ||
    !Number.isFinite(p.updatedAt) ||
    !p.location ||
    p.location.format !== book.format ||
    (p.location.format === 'epub' &&
      (typeof p.location.cfi !== 'string' || !p.location.cfi.startsWith('epubcfi('))) ||
    (p.location.format === 'txt' &&
      (!Number.isSafeInteger(p.location.characterOffset) || p.location.characterOffset < 0))
  )
    throw new Error('備份閱讀位置無效。')
  return { bookId: book.id, location: p.location, percentage: p.percentage, updatedAt: p.updatedAt }
}
function validLocation(value: unknown, format: BookMetadata['format']) {
  if (!value || typeof value !== 'object') return false
  const location = value as ReadingProgress['location']
  return (
    location.format === format &&
    ((location.format === 'epub' &&
      typeof location.cfi === 'string' &&
      location.cfi.startsWith('epubcfi(')) ||
      (location.format === 'txt' &&
        Number.isSafeInteger(location.characterOffset) &&
        location.characterOffset >= 0) ||
      (location.format === 'pdf' && Number.isSafeInteger(location.page) && location.page >= 1))
  )
}
function validateMarks(value: Json, book: BookMetadata): ReadingMarks {
  const marks = value as unknown as ReadingMarks
  const validItem = (item: ReadingMarks['bookmarks'][number] | ReadingMarks['trail'][number]) =>
    !!item &&
    typeof item.id === 'string' &&
    typeof item.label === 'string' &&
    item.label.length <= 200 &&
    Number.isFinite(item.percentage) &&
    item.percentage >= 0 &&
    item.percentage <= 1 &&
    Number.isFinite(item.createdAt) &&
    validLocation(item.location, book.format)
  if (
    !marks ||
    !Array.isArray(marks.bookmarks) ||
    !Array.isArray(marks.trail) ||
    marks.bookmarks.length > 1000 ||
    marks.trail.length > 20 ||
    !Number.isFinite(marks.updatedAt) ||
    !marks.bookmarks.every(
      (item) =>
        validItem(item) &&
        Number.isFinite(item.updatedAt) &&
        (item.excerpt === undefined ||
          (typeof item.excerpt === 'string' && item.excerpt.length <= 500)),
    ) ||
    !marks.trail.every(validItem)
  )
    throw new Error('備份書籤資料無效。')
  return marks
}
// Re-read local state inside the same write transaction that applies the merge.
// Changes made while a network request was in flight therefore cannot be overwritten.
export async function applyRemote(
  key: string,
  remote: SyncDocument,
  assets: Record<string, Asset>,
  source: { accountId: string; folderId: string },
  resolution?: Record<string, Json>,
) {
  const db = await openReaderDatabase()
  const tx = db.transaction(stores, 'readwrite')
  void tx.done.catch(() => undefined)
  try {
    let state = captureChanges(
      (await tx.objectStore('syncState').get(key)) ?? newState(),
      await localFields(tx),
    )
    state = {
      ...state,
      document: mergeDocuments(state.document, remote),
      assets: { ...assets, ...state.assets },
    }
    if (resolution) state.document = writeFields(state.document, state.device, resolution)
    const fields = materialize(state.document)
    const existing = await tx.objectStore('books').getAll()
    const byHash = new Map(existing.map((book) => [book.fileHash, book]))
    for (const [field, alive] of Object.entries(fields)) {
      if (!field.endsWith('/alive')) continue
      const hash = field.split('/')[0]
      const previous = byHash.get(hash)
      if (alive === false) {
        if (previous)
          for (const name of [
            'books',
            'progress',
            'readerSettings',
            'bookFiles',
            'bookCovers',
            'epubLocations',
            'readingMarks',
          ] as const)
            await tx.objectStore(name).delete(previous.id)
        continue
      }
      if (alive !== true) throw new Error('備份書架狀態無效。')
      const book = bookFromFields(hash, fields, previous)
      const asset = state.assets[hash]
      book.downloaded = !!(await tx.objectStore('bookFiles').getKey(book.id))
      if (asset) book.cloudSource = { ...source, ...asset }
      await tx.objectStore('books').put(book)
      const progress = fields[hash + '/progress']
      if (progress) await tx.objectStore('progress').put(validateProgress(progress, book), book.id)
      else if (progress === null) await tx.objectStore('progress').delete(book.id)
      const settings = settingsFromFields(fields, hash + '/setting')
      if (settings)
        await tx.objectStore('readerSettings').put({ settings, updatedAt: Date.now() }, book.id)
      else await tx.objectStore('readerSettings').delete(book.id)
      const marks = fields[hash + '/marks']
      if (marks) await tx.objectStore('readingMarks').put(validateMarks(marks, book), book.id)
      else if (marks === null) await tx.objectStore('readingMarks').delete(book.id)
    }
    if (fields['app/theme']) {
      const readingDefaults = settingsFromFields(fields, 'app/default')
      await tx.objectStore('preferences').put(
        parsePreferences({
          theme: fields['app/theme'],
          librarySort: fields['app/librarySort'],
          seriesSort: fields['app/seriesSort'],
          ...(readingDefaults ? { readingDefaults } : {}),
        }),
        'app',
      )
    }
    state.baseline = await localFields(tx)
    await tx.objectStore('syncState').put(state, key)
    await tx.done
    return state
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* already aborted */
    }
    await tx.done.catch(() => undefined)
    throw error
  } finally {
    db.close()
  }
}

export async function storeDownloaded(book: BookMetadata, file: Blob, cover?: Blob) {
  const bytes = await file.arrayBuffer()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('')
  if (hash !== book.fileHash) throw new Error('雲端書籍內容驗證失敗，未覆蓋本機檔案。')
  const coverBytes = cover ? await cover.arrayBuffer() : undefined
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(['books', 'bookFiles', 'bookCovers'], 'readwrite')
    const current = await tx.objectStore('books').get(book.id)
    if (current) {
      await tx.objectStore('bookFiles').put({ bytes, mimeType: file.type }, book.id)
      if (coverBytes)
        await tx
          .objectStore('bookCovers')
          .put({ bytes: coverBytes, mimeType: cover!.type }, book.id)
      await tx
        .objectStore('books')
        .put({ ...current, downloaded: true, coverCached: !!coverBytes || current.coverCached })
    }
    await tx.done
  } finally {
    db.close()
  }
}

export async function cacheBookCover(id: string, cover: Blob) {
  const bytes = await cover.arrayBuffer()
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(['books', 'bookCovers'], 'readwrite')
    const book = await tx.objectStore('books').get(id)
    if (book) {
      await tx.objectStore('bookCovers').put({ bytes, mimeType: cover.type }, id)
      await tx.objectStore('books').put({ ...book, coverCached: true })
    }
    await tx.done
  } finally {
    db.close()
  }
}
