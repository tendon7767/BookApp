import { expect, it } from 'vitest'
import {
  captureChanges,
  conflicts,
  emptyDocument,
  materialize,
  mergeDocuments,
  parseSnapshot,
  writeFields,
  type SyncState,
} from './syncModel'

const hash = 'a'.repeat(64)
const title = hash + '/title'
const alive = hash + '/alive'
const initial = writeFields(emptyDocument(), 'origin', { [title]: '原書名', [alive]: true })
it('merges independent offline edits and converges in either order', () => {
  const a = writeFields(initial, 'a', { [title]: '新名稱' })
  const b = writeFields(initial, 'b', { [hash + '/category']: '小說' })
  expect(materialize(mergeDocuments(a, b))).toEqual(materialize(mergeDocuments(b, a)))
  expect(materialize(mergeDocuments(a, b))).toMatchObject({
    [title]: '新名稱',
    [hash + '/category']: '小說',
  })
  expect(conflicts(mergeDocuments(a, b))).toHaveLength(0)
})
it('keeps both simultaneous values regardless of wall clock and resolves causally', () => {
  const a = writeFields(initial, 'a', { [title]: '甲' })
  const b = writeFields(initial, 'b', { [title]: '乙' })
  a.fields[title][0].time = 9999999999999
  const merged = mergeDocuments(a, b)
  expect(conflicts(merged)).toHaveLength(1)
  const resolved = writeFields(merged, 'b', { [title]: '甲' })
  expect(conflicts(mergeDocuments(resolved, a))).toHaveLength(0)
  expect(materialize(mergeDocuments(resolved, b))[title]).toBe('甲')
})
it('does not use the largest reading percentage as the winner', () => {
  const first = writeFields(initial, 'a', { [hash + '/progress']: { percentage: 0.9 } })
  const reread = writeFields(first, 'b', { [hash + '/progress']: { percentage: 0.2 } })
  expect(materialize(mergeDocuments(first, reread))[hash + '/progress']).toEqual({
    percentage: 0.2,
  })
})
it('retains concurrent delete/edit as a visible book and a resolvable conflict', () => {
  const state: SyncState = {
    device: 'a',
    generation: 0,
    document: initial,
    baseline: materialize(initial),
    assets: {},
  }
  const removed = captureChanges(state, {}).document
  const edited = captureChanges(
    { ...state, device: 'b' },
    { [title]: '保留修改', [alive]: true },
  ).document
  const merged = mergeDocuments(removed, edited)
  expect(conflicts(merged).map(([key]) => key)).toContain(alive)
  expect(materialize(merged)[alive]).toBe(true)
  expect(
    materialize(mergeDocuments(writeFields(merged, 'a', { [alive]: false }), edited))[alive],
  ).toBe(false)
})
it('is idempotent and does not manufacture edits when capturing unchanged data', () => {
  const state: SyncState = {
    device: 'a',
    generation: 0,
    document: initial,
    baseline: materialize(initial),
    assets: {},
  }
  expect(captureChanges(state, state.baseline).document).toBe(initial)
  expect(mergeDocuments(initial, initial)).toEqual(initial)
})
it('does not ask users to resolve import timestamps for identical book bytes', () => {
  const a = writeFields(initial, 'a', { [hash + '/core']: { fileName: '原名.txt', createdAt: 1 } })
  const b = writeFields(initial, 'b', { [hash + '/core']: { fileName: '副本.txt', createdAt: 2 } })
  const merged = mergeDocuments(a, b)
  expect(conflicts(merged)).toHaveLength(0)
  expect(materialize(merged)[hash + '/core']).toEqual({ fileName: '原名.txt', createdAt: 1 })
})
it('rejects incompatible and malformed snapshots before merge', () => {
  const valid = {
    schema: 1,
    device: 'a',
    generation: 1,
    createdAt: 1,
    document: initial,
    assets: { [hash]: { id: 'remote' } },
  }
  expect(parseSnapshot(valid)).toEqual(valid)
  expect(() => parseSnapshot({ ...valid, schema: 2 })).toThrow()
  expect(() => parseSnapshot({ ...valid, document: { ...initial, clock: {} } })).toThrow()
  expect(() =>
    parseSnapshot({ ...valid, assets: { [hash]: { id: 'https://other.example' } } }),
  ).toThrow()
})
