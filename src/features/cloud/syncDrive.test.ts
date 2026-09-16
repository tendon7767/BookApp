import { afterEach, expect, it, vi } from 'vitest'
import { SyncDrive } from './syncDrive'
const signal = new AbortController().signal
afterEach(() => vi.unstubAllGlobals())
it('uploads in resumable chunks with authorization in headers and the selected parent', async () => {
  const requests: { url: string; options: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      requests.push({ url, options })
      if (options.method === 'POST')
        return new Response('', {
          headers: {
            Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=session',
          },
        })
      if (options.method === 'PUT') {
        if (
          String((options.headers as Record<string, string>)['Content-Range']).startsWith(
            'bytes 0-',
          )
        )
          return new Response('', { status: 308, headers: { Range: 'bytes=0-1048575' } })
        return new Response('{}')
      }
      return new Response('{}', { status: 404 })
    }),
  )
  const blob = new Blob([new Uint8Array(1024 * 1024 + 10)], { type: 'text/plain' })
  await new SyncDrive(() => 'secret').upload(
    'id',
    'chosen-folder',
    '書.txt',
    blob,
    { kanshu: 'book-v1', hash: 'hash' },
    signal,
  )
  expect(
    JSON.parse(requests.find((r) => r.options.method === 'POST')!.options.body as string),
  ).toMatchObject({ id: 'id', parents: ['chosen-folder'] })
  expect(requests.filter((r) => r.options.method === 'PUT')).toHaveLength(2)
  expect(
    requests.every(
      (r) =>
        !r.url.includes('secret') &&
        (r.options.headers as Record<string, string>).Authorization === 'Bearer secret',
    ),
  ).toBe(true)
})
it('does not duplicate an upload whose successful response was lost', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ size: '3', appProperties: { kanshu: 'book-v1' } })),
  )
  vi.stubGlobal('fetch', fetch)
  await new SyncDrive(() => 'token').upload(
    'fixed-id',
    'folder',
    '書.txt',
    new Blob(['abc']),
    { kanshu: 'book-v1' },
    signal,
  )
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects an unexpected resumable location before sending credentials there', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    .mockResolvedValueOnce(
      new Response('', { headers: { Location: 'https://evil.example/upload' } }),
    )
  vi.stubGlobal('fetch', fetch)
  await expect(
    new SyncDrive(() => 'token').upload('id', 'folder', '書.txt', new Blob(['abc']), {}, signal),
  ).rejects.toThrow('位置無效')
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('rejects an incomplete Drive listing rather than assuming remote records disappeared', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ files: [], incompleteSearch: true }))),
  )
  await expect(new SyncDrive(() => 'token').entries('folder', signal)).rejects.toThrow('不完整')
})
