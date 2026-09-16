import { afterEach, expect, it, vi } from 'vitest'
import { DriveClient, DriveError, parseDriveFile } from './driveClient'
import { MAX_IMPORT_BYTES } from '../import/importBook'
import { parseDriveConfig } from './types'

const record = {
  id: 'book-1',
  name: '書.txt',
  size: '3',
  mimeType: 'text/plain',
  version: '7',
  modifiedTime: '2026-09-17T00:00:00Z',
  capabilities: { canDownload: true },
  resourceKey: 'key-1',
}
const signal = () => new AbortController().signal
afterEach(() => vi.unstubAllGlobals())
it('validates public configuration without accepting a client secret as the client ID', () => {
  expect(() => parseDriveConfig({ clientId: 'secret' })).toThrow('用戶端 ID')
  expect(() =>
    parseDriveConfig({
      clientId: '123-abc.apps.googleusercontent.com',
      apiKey: 'x'.repeat(30),
      appId: 'bookapp-123',
    }),
  ).toThrow('專案編號')
})
it('rejects unsupported, missing-version, trashed and invalid-size cloud metadata', () => {
  for (const invalid of [
    { name: '書.pdf' },
    { version: undefined },
    { size: 'NaN' },
    { size: '0' },
    { trashed: true },
    { mimeType: 'application/vnd.google-apps.shortcut' },
  ])
    expect(() => parseDriveFile({ ...record, ...invalid })).toThrow()
  expect(parseDriveFile(record).size).toBe(3)
})
it('paginates only metadata with an authorization header, not a token URL or cached request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        files: [record, { ...record, name: 'ignore.pdf' }],
        nextPageToken: 'second',
      }),
    )
    .mockResolvedValueOnce(Response.json({ files: [{ ...record, id: 'book-2' }] }))
  vi.stubGlobal('fetch', fetcher)
  const files = await new DriveClient(() => 'private-token').list(signal())
  expect(files.map((file) => file.id)).toEqual(['book-1', 'book-2'])
  expect(fetcher.mock.calls[1][0]).toContain('pageToken=second')
  for (const [url, options] of fetcher.mock.calls) {
    expect(url).not.toContain('private-token')
    expect(options).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: 'Bearer private-token' },
    })
  }
})
it('rejects a repeated page token and maps expiration without exposing server messages', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ files: [], nextPageToken: 'same' })),
      ),
  )
  await expect(new DriveClient(() => 'token').list(signal())).rejects.toThrow('分頁異常')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private error', { status: 401 })))
  await expect(new DriveClient(() => 'token').file('book-1', signal())).rejects.toBeInstanceOf(
    DriveError,
  )
  await expect(new DriveClient(() => 'token').file('book-1', signal())).rejects.toThrow('重新連接')
})
it('downloads bounded raw bytes, sends shared-file resource keys and rejects truncated content', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))))
  vi.stubGlobal('fetch', fetcher)
  const client = new DriveClient(() => 'token')
  const progress = vi.fn()
  const file = await client.download(parseDriveFile(record), signal(), progress)
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  expect(progress).toHaveBeenLastCalledWith(3)
  expect(fetcher.mock.calls[0][1].headers['X-Goog-Drive-Resource-Keys']).toBe('book-1/key-1')
  await expect(
    client.download({ ...parseDriveFile(record), size: 4 }, signal(), progress),
  ).rejects.toThrow('大小')
  await expect(
    client.download({ ...parseDriveFile(record), size: MAX_IMPORT_BYTES + 1 }, signal(), progress),
  ).rejects.toThrow('50 MB')
  await expect(
    client.download({ ...parseDriveFile(record), canDownload: false }, signal(), progress),
  ).rejects.toThrow('未允許下載')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('stops an oversized response even if the server advertises a small file', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_IMPORT_BYTES + 1))
    },
    cancel,
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)))
  await expect(
    new DriveClient(() => 'token').download(parseDriveFile(record), signal(), () => {}),
  ).rejects.toThrow('停止下載')
  expect(cancel).toHaveBeenCalledOnce()
})
