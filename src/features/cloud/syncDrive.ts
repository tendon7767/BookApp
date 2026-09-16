import { DriveClient, DriveError } from './driveClient'

export interface RemoteEntry {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
  appProperties?: Record<string, string>
  capabilities?: { canAddChildren?: boolean }
}
const API = 'https://www.googleapis.com/drive/v3/'
const fields = 'id,name,mimeType,size,createdTime,appProperties,capabilities(canAddChildren)'
const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
export class SyncDrive extends DriveClient {
  private access: () => string
  constructor(access: () => string) {
    super(access)
    this.access = access
  }
  private async send(url: string, signal: AbortSignal, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: { ...options.headers, Authorization: `Bearer ${this.access()}` },
    })
    if (!response.ok && response.status !== 308) throw new DriveError(response.status)
    return response
  }
  async entry(id: string, signal: AbortSignal): Promise<RemoteEntry> {
    return (
      await this.send(
        API +
          `files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`,
        signal,
      )
    ).json()
  }
  async entries(parent: string, signal: AbortSignal): Promise<RemoteEntry[]> {
    const result: RemoteEntry[] = []
    let pageToken = ''
    const seen = new Set<string>()
    do {
      if (seen.has(pageToken)) throw new Error('雲端分頁異常，請重試。')
      seen.add(pageToken)
      const params = new URLSearchParams({
        q: `'${quote(parent)}' in parents and trashed = false`,
        fields: `nextPageToken,incompleteSearch,files(${fields})`,
        pageSize: '1000',
        ...(pageToken ? { pageToken } : {}),
      })
      const data = await (await this.send(API + 'files?' + params, signal)).json()
      if (!Array.isArray(data.files) || data.incompleteSearch)
        throw new Error('雲端清單不完整，已停止同步。')
      result.push(...data.files)
      pageToken = data.nextPageToken ?? ''
    } while (pageToken)
    return result
  }
  async folder(parent: string, signal: AbortSignal) {
    const selected = await this.entry(parent, signal)
    if (
      selected.mimeType !== 'application/vnd.google-apps.folder' ||
      !selected.capabilities?.canAddChildren
    )
      throw new Error('請選擇可寫入的 Google Drive 資料夾。')
    if (selected.appProperties?.kanshu === 'library-v1') return selected
    const folders = (await this.entries(parent, signal)).filter(
      (item) => item.appProperties?.kanshu === 'library-v1',
    )
    if (folders.length > 1)
      throw new Error('此處有多份「看書」備份，請直接選擇要使用的「看書」子資料夾。')
    if (folders[0]) return folders[0]
    return (
      await this.send(API + 'files?fields=' + encodeURIComponent(fields), signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '看書',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parent],
          appProperties: { kanshu: 'library-v1' },
        }),
      })
    ).json() as Promise<RemoteEntry>
  }
  async generateId(signal: AbortSignal): Promise<string> {
    const data = await (
      await this.send(API + 'files/generateIds?count=1&space=drive&type=files', signal)
    ).json()
    if (!Array.isArray(data.ids) || !/^[\w-]+$/.test(data.ids[0]))
      throw new Error('無法建立上傳識別碼。')
    return data.ids[0]
  }
  // Stable preallocated IDs make an interrupted request safe to retry, including
  // the case where Google committed the bytes but the response was lost.
  async upload(
    id: string,
    parent: string,
    name: string,
    body: Blob,
    properties: Record<string, string>,
    signal: AbortSignal,
    progress?: (n: number) => void,
  ) {
    try {
      const existing = await this.entry(id, signal)
      if (
        Number(existing.size) === body.size &&
        Object.entries(properties).every(([k, v]) => existing.appProperties?.[k] === v)
      )
        return
      throw new Error('雲端上傳識別碼已被其他檔案使用，已停止同步。')
    } catch (error) {
      if (!(error instanceof DriveError && error.status === 404)) throw error
    }
    const start = await this.send(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
      signal,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': body.type || 'application/octet-stream',
          'X-Upload-Content-Length': String(body.size),
        },
        body: JSON.stringify({ id, name, parents: [parent], appProperties: properties }),
      },
    )
    const location = start.headers.get('Location')
    if (!location) throw new Error('Google 未回傳上傳位置。')
    const url = new URL(location)
    if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith('/upload/drive/'))
      throw new Error('Google 上傳位置無效。')
    const chunk = 1024 * 1024
    let offset = 0
    while (offset < body.size) {
      const end = Math.min(body.size, offset + chunk)
      const response = await this.send(location, signal, {
        method: 'PUT',
        headers: {
          'Content-Type': body.type || 'application/octet-stream',
          'Content-Range': `bytes ${offset}-${end - 1}/${body.size}`,
        },
        body: await body.slice(offset, end).arrayBuffer(),
      })
      if (response.status === 308) {
        const range = response.headers.get('Range')?.match(/^bytes=0-(\d+)$/)
        const accepted = range ? Number(range[1]) + 1 : 0
        if (accepted <= offset || accepted > end || end === body.size)
          throw new Error('上傳進度未獲確認，請重試。')
        offset = accepted
      } else {
        if (end !== body.size) throw new Error('Google 提前結束上傳，請重試。')
        offset = end
      }
      progress?.(offset / body.size)
    }
  }
  async blob(id: string, limit: number, signal: AbortSignal): Promise<Blob> {
    const response = await this.send(API + `files/${encodeURIComponent(id)}?alt=media`, signal)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('無法讀取雲端資料。')
    const chunks: ArrayBuffer[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) throw new Error('雲端資料超過大小限制，已停止下載。')
        chunks.push(value.slice().buffer)
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    return new Blob(chunks, {
      type: response.headers.get('Content-Type') ?? 'application/octet-stream',
    })
  }
}
