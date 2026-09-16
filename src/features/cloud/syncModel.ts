// Multi-value registers with vector clocks. Wall clocks are display-only: two
// offline devices never silently discard each other's edits due to clock skew.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Clock = Record<string, number>
export interface Version {
  value: Json
  clock: Clock
  device: string
  time: number
}
export interface SyncDocument {
  schema: 1
  clock: Clock
  fields: Record<string, Version[]>
}
export interface Asset {
  id: string
  coverId?: string
}
export interface Snapshot {
  schema: 1
  device: string
  generation: number
  createdAt: number
  document: SyncDocument
  assets: Record<string, Asset>
}
export interface SyncState {
  device: string
  generation: number
  document: SyncDocument
  baseline: Record<string, Json>
  assets: Record<string, Asset>
  published?: string
  lastSync?: number
  pending?: { id: string; snapshot: Snapshot }
  uploadIds?: Record<string, string>
}
export const emptyDocument = (): SyncDocument => ({ schema: 1, clock: {}, fields: {} })
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function joinClock(a: Clock, b: Clock): Clock {
  const result = { ...a }
  for (const [id, n] of Object.entries(b)) result[id] = Math.max(result[id] ?? 0, n)
  return result
}
function dominates(a: Clock, b: Clock) {
  return Object.entries(b).every(([id, n]) => (a[id] ?? 0) >= n)
}
export function mergeDocuments(a: SyncDocument, b: SyncDocument): SyncDocument {
  const fields: SyncDocument['fields'] = {}
  for (const key of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])) {
    const versions: Version[] = []
    for (const version of [...(a.fields[key] ?? []), ...(b.fields[key] ?? [])]) {
      if (versions.some((v) => dominates(v.clock, version.clock))) continue
      for (let i = versions.length - 1; i >= 0; i--)
        if (dominates(version.clock, versions[i].clock)) versions.splice(i, 1)
      versions.push(version)
    }
    // Deterministic preview only. Concurrent values remain available for resolution.
    fields[key] = versions.sort((x, y) => x.device.localeCompare(y.device))
  }
  return { schema: 1, clock: joinClock(a.clock, b.clock), fields }
}
export function writeFields(
  doc: SyncDocument,
  device: string,
  edits: Record<string, Json>,
): SyncDocument {
  if (!Object.keys(edits).length) return doc
  const clock = { ...doc.clock, [device]: (doc.clock[device] ?? 0) + 1 }
  const fields = { ...doc.fields }
  for (const [key, value] of Object.entries(edits))
    fields[key] = [{ value, clock, device, time: Date.now() }]
  return { schema: 1, clock, fields }
}
export function materialize(doc: SyncDocument): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(doc.fields).map(([key, versions]) => {
      // Concurrent delete/edit keeps the book visible until the conflict is resolved.
      let value =
        key.endsWith('/alive') && versions.some((v) => v.value === true) ? true : versions[0].value
      // Immutable import facts are not user edits. The same bytes imported on two
      // devices can have different filenames/dates; retain the earliest import.
      if (key.endsWith('/core'))
        value = [...versions].sort((a, b) => {
          const created = (v: Version) =>
            Number((v.value as { createdAt?: number })?.createdAt ?? 0)
          return created(a) - created(b) || a.device.localeCompare(b.device)
        })[0].value
      return [key, value]
    }),
  )
}
export function conflicts(doc: SyncDocument) {
  return Object.entries(doc.fields).filter(
    ([key, values]) =>
      !key.endsWith('/core') && new Set(values.map((v) => JSON.stringify(v.value))).size > 1,
  )
}
export function captureChanges(state: SyncState, current: Record<string, Json>): SyncState {
  const edits: Record<string, Json> = {}
  for (const [key, value] of Object.entries(current))
    if (!equal(state.baseline[key], value)) edits[key] = value
  for (const key of Object.keys(state.baseline)) {
    if (key.endsWith('/alive') && !(key in current)) edits[key] = false
    // Missing per-book preferences/progress is not a deletion when the book is gone.
    else if (!(key in current) && (key.startsWith('app/') || current[key.split('/')[0] + '/alive']))
      edits[key] = null
  }
  // An edit asserts existence, making concurrent delete/edit an explicit conflict.
  for (const key of Object.keys(edits)) {
    const hash = key.split('/')[0]
    if (hash !== 'app' && current[hash + '/alive']) edits[hash + '/alive'] = true
  }
  return { ...state, document: writeFields(state.document, state.device, edits), baseline: current }
}

// Validate before touching IndexedDB; a future/incomplete backup must never clear a shelf.
export function parseSnapshot(value: unknown): Snapshot {
  const data = value as Snapshot
  if (
    !data ||
    data.schema !== 1 ||
    !/^[\w-]{1,100}$/.test(data.device) ||
    !Number.isSafeInteger(data.generation) ||
    data.generation < 1 ||
    !Number.isFinite(data.createdAt) ||
    !data.document ||
    data.document.schema !== 1 ||
    !data.document.fields ||
    !data.assets
  )
    throw new Error('備份格式不相容或不完整，未修改本機資料。')
  const checkClock = (clock: Clock) => {
    if (!clock || typeof clock !== 'object' || Array.isArray(clock))
      throw new Error('備份版本資訊無效。')
    for (const [id, n] of Object.entries(clock))
      if (
        !/^[\w-]{1,100}$/.test(id) ||
        ['__proto__', 'constructor', 'prototype'].includes(id) ||
        !Number.isSafeInteger(n) ||
        n < 0
      )
        throw new Error('備份版本資訊無效。')
  }
  checkClock(data.document.clock)
  for (const [key, values] of Object.entries(data.document.fields)) {
    if (
      !/^(app|[a-f0-9]{64})\/[a-zA-Z]+$/.test(key) ||
      !Array.isArray(values) ||
      !values.length ||
      values.length > 100
    )
      throw new Error('備份欄位無效。')
    for (const v of values) {
      if (!v || !Number.isFinite(v.time) || typeof v.device !== 'string' || v.value === undefined)
        throw new Error('備份欄位無效。')
      checkClock(v.clock)
      if (!dominates(data.document.clock, v.clock)) throw new Error('備份版本資訊不完整。')
    }
  }
  for (const [hash, asset] of Object.entries(data.assets))
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      !asset ||
      !/^[\w-]+$/.test(asset.id) ||
      (asset.coverId && !/^[\w-]+$/.test(asset.coverId))
    )
      throw new Error('備份原檔索引無效。')
  for (const [key, values] of Object.entries(data.document.fields))
    if (
      key.endsWith('/alive') &&
      values.some((v) => v.value === true) &&
      !data.assets[key.split('/')[0]]
    )
      throw new Error('備份缺少書籍原檔，未套用變更。')
  return data
}
