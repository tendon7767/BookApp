import { getBookCover, getBookFile, listBooks } from '../../storage/bookRepository'
import {
  applyRemote,
  cacheBookCover,
  captureLocal,
  saveSyncState,
  readSyncState,
  storeDownloaded,
} from '../../storage/syncRepository'
import {
  conflicts,
  emptyDocument,
  materialize,
  mergeDocuments,
  parseSnapshot,
  type Asset,
  type Json,
  type Snapshot,
  type SyncState,
} from './syncModel'
import { SyncDrive, type RemoteEntry } from './syncDrive'
import type { BookMetadata } from '../../domain/book'

export interface SyncTarget {
  accountId: string
  id: string
  name: string
}
export const targetKey = (target: SyncTarget) => `${target.accountId}:${target.id}`
export const fingerprint = (state: SyncState) =>
  JSON.stringify({ document: state.document, assets: state.assets })
export async function withSyncLock<T>(task: () => Promise<T>): Promise<T | undefined> {
  if (!navigator.locks)
    throw new Error('此瀏覽器不支援安全同步鎖，請更新 Safari 後重試。本機閱讀不受影響。')
  return navigator.locks.request('kanshu-sync', { ifAvailable: true }, (lock) =>
    lock ? task() : undefined,
  )
}
export function latestSnapshots(entries: RemoteEntry[]) {
  const latest = new Map<string, RemoteEntry>()
  for (const entry of entries) {
    if (entry.appProperties?.kanshu !== 'snapshot-v1') continue
    const { device, generation } = entry.appProperties
    if (!device || !Number.isSafeInteger(Number(generation)) || Number(generation) < 1)
      throw new Error('備份索引版本無效。')
    const previous = latest.get(device)
    if (!previous || Number(previous.appProperties!.generation) < Number(generation))
      latest.set(device, entry)
  }
  return [...latest.values()]
}
export async function loadSnapshot(drive: SyncDrive, entry: RemoteEntry, signal: AbortSignal) {
  const snapshot = parseSnapshot(
    JSON.parse(await (await drive.blob(entry.id, 16 * 1024 * 1024, signal)).text()),
  )
  if (
    snapshot.device !== entry.appProperties?.device ||
    snapshot.generation !== Number(entry.appProperties?.generation)
  )
    throw new Error('備份索引與內容不符，未套用變更。')
  return snapshot
}
async function publishPending(
  drive: SyncDrive,
  target: SyncTarget,
  state: SyncState,
  signal: AbortSignal,
) {
  if (!state.pending) return state
  const { id, snapshot } = state.pending
  await drive.upload(
    id,
    target.id,
    `書架備份-${snapshot.device}-${snapshot.generation}.json`,
    new Blob([JSON.stringify(snapshot)], { type: 'application/json' }),
    { kanshu: 'snapshot-v1', device: snapshot.device, generation: String(snapshot.generation) },
    signal,
  )
  const next = {
    ...state,
    pending: undefined,
    published: JSON.stringify({ document: snapshot.document, assets: snapshot.assets }),
    lastSync: Date.now(),
  }
  await saveSyncState(targetKey(target), next)
  return next
}
export async function synchronize(
  drive: SyncDrive,
  target: SyncTarget,
  signal: AbortSignal,
  report: (message: string) => void,
) {
  const key = targetKey(target)
  // Finish a previously committed outbox item before allocating another snapshot.
  let state = await captureLocal(key)
  state = await publishPending(drive, target, state, signal)
  report('正在合併書架與閱讀設定…')
  const entries = await drive.entries(target.id, signal)
  let remote = emptyDocument()
  const assets: Record<string, Asset> = {}
  for (const entry of latestSnapshots(entries)) {
    const snapshot = await loadSnapshot(drive, entry, signal)
    remote = mergeDocuments(remote, snapshot.document)
    Object.assign(assets, snapshot.assets)
  }
  signal.throwIfAborted()
  state = await applyRemote(key, remote, assets, {
    accountId: target.accountId,
    folderId: target.id,
  })
  const books = await listBooks()
  for (const book of books) {
    if (state.assets[book.fileHash]) continue
    const file = await getBookFile(book.id)
    if (!file)
      throw new Error(`「${book.title}」原檔尚未下載；請先從原備份位置下載，再切換備份位置。`)
    const cover = await getBookCover(book.id)
    const upload = async (body: Blob, kind: string, name: string) => {
      const uploadKey = book.fileHash + ':' + kind
      let id = state.uploadIds?.[uploadKey]
      if (!id) {
        id = await drive.generateId(signal)
        state.uploadIds = { ...state.uploadIds, [uploadKey]: id }
        await saveSyncState(key, state)
      }
      await drive.upload(
        id,
        target.id,
        name,
        body,
        { kanshu: kind, hash: book.fileHash },
        signal,
        (p) => report(`正在備份「${book.title}」· ${Math.round(p * 100)}%`),
      )
      return id
    }
    const id = await upload(file, 'book-v1', book.fileName)
    const coverId = cover ? await upload(cover, 'cover-v1', `${book.fileHash}.cover`) : undefined
    state.assets[book.fileHash] = { id, ...(coverId ? { coverId } : {}) }
    await saveSyncState(key, state)
  }
  // Capture edits made during uploads. New imports are left for the next pass:
  // no snapshot is published until every live book has a durable original.
  state = await captureLocal(key)
  const values = materialize(state.document)
  const missing = Object.entries(values).some(
    ([k, v]) => k.endsWith('/alive') && v === true && !state.assets[k.split('/')[0]],
  )
  if (missing) return { state, again: true, entries }
  if (fingerprint(state) !== state.published) {
    state.generation++
    const snapshot: Snapshot = {
      schema: 1,
      device: state.device,
      generation: state.generation,
      createdAt: Date.now(),
      document: state.document,
      assets: state.assets,
    }
    state.pending = { id: await drive.generateId(signal), snapshot }
    const snapshotId = state.pending.id
    await saveSyncState(key, state)
    report('正在保存書架備份…')
    state = await publishPending(drive, target, state, signal)
    entries.push({
      id: snapshotId,
      name: '書架備份',
      mimeType: 'application/json',
      createdTime: new Date(snapshot.createdAt).toISOString(),
      appProperties: {
        kanshu: 'snapshot-v1',
        device: snapshot.device,
        generation: String(snapshot.generation),
      },
    })
  }
  state.lastSync = Date.now()
  await saveSyncState(key, state)
  // Attach cloud locations after successful original upload without changing content positions.
  state = await applyRemote(
    key,
    emptyDocument(),
    {},
    { accountId: target.accountId, folderId: target.id },
  )
  let covers = 0
  for (const book of await listBooks()) {
    if (!book.hasCover || !book.cloudSource?.coverId || (await getBookCover(book.id))) continue
    if (++covers > 10) break
    report('正在還原封面…')
    await cacheBookCover(
      book.id,
      await drive.blob(book.cloudSource.coverId, 5 * 1024 * 1024, signal),
    )
  }
  return { state, again: fingerprint(state) !== state.published, entries }
}
export async function resolveConflict(target: SyncTarget, field: string, value: Json) {
  return applyRemote(
    targetKey(target),
    emptyDocument(),
    {},
    { accountId: target.accountId, folderId: target.id },
    { [field]: value },
  )
}
export async function restoreSnapshot(target: SyncTarget, snapshot: Snapshot) {
  const key = targetKey(target)
  // A restore is a new, explicit edit on this device, not an old version being replayed.
  const state = await captureLocal(key)
  const values = materialize(snapshot.document)
  for (const field of Object.keys(state.document.fields)) {
    const hash = field.split('/')[0]
    if (
      !(field in values) &&
      (hash === 'app' || values[hash + '/alive'] === true) &&
      (field.startsWith('app/default') || field.endsWith('/progress') || field.includes('/setting'))
    )
      values[field] = null
  }
  state.assets = { ...snapshot.assets, ...state.assets }
  await saveSyncState(key, state)
  return applyRemote(
    key,
    emptyDocument(),
    {},
    { accountId: target.accountId, folderId: target.id },
    values,
  )
}
export async function downloadBook(
  drive: SyncDrive,
  book: BookMetadata,
  accountId: string,
  signal: AbortSignal,
  report: (message: string) => void,
) {
  if (!book.cloudSource || book.cloudSource.accountId !== accountId)
    throw new Error('請先連接這本書所屬的 Google 帳號。')
  report(`正在下載「${book.title}」…`)
  const file = await drive.blob(book.cloudSource.id, 50 * 1024 * 1024, signal)
  if (file.size !== book.fileSize) throw new Error('書籍大小與備份不符，未保存下載內容。')
  const cover = book.cloudSource.coverId
    ? await drive.blob(book.cloudSource.coverId, 5 * 1024 * 1024, signal)
    : undefined
  signal.throwIfAborted()
  await storeDownloaded(book, file, cover)
}
export async function syncSummary(target: SyncTarget) {
  const state = await readSyncState(targetKey(target))
  return { state, conflicts: state ? conflicts(state.document) : [] }
}
