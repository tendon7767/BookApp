import { MAX_IMPORT_BYTES } from '../import/importBook'
import type { DriveAccount, DriveFile } from './types'

const API = 'https://www.googleapis.com/drive/v3/'
const fields =
  'id,name,mimeType,size,version,modifiedTime,resourceKey,trashed,capabilities(canDownload)'
export class DriveError extends Error {
  readonly status: number
  constructor(status: number) {
    super(
      status === 401
        ? 'Google 連接已過期，請重新連接。'
        : status === 403
          ? 'Google 拒絕存取。請確認檔案下載權限、API 設定或稍後重試。'
          : status === 404
            ? '找不到雲端檔案，可能已移除或尚未授權。請重新選取。'
            : status === 429 || status >= 500
              ? 'Google 服務暫時忙碌，請稍後重試。'
              : 'Google Drive 請求失敗，請重試。',
    )
    this.status = status
  }
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
export function parseDriveFile(value: unknown): DriveFile {
  const data = object(value)
  if (typeof data.id !== 'string' || !/^[\w-]+$/.test(data.id) || typeof data.name !== 'string')
    throw new Error('Google 回傳了無法辨識的檔案。')
  if (data.trashed) throw new Error('這個檔案已移到 Google Drive 垃圾桶。')
  if (
    !/\.(epub|txt)$/i.test(data.name) ||
    String(data.mimeType).startsWith('application/vnd.google-apps.')
  )
    throw new Error('目前雲端書庫支援 EPUB 和 TXT 原檔。')
  const size = Number(data.size)
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error('雲端檔案為空或大小不明，尚未加入。')
  if (typeof data.version !== 'string' || !/^\d+$/.test(data.version))
    throw new Error('雲端檔案缺少版本資訊，請重試。')
  return {
    id: data.id,
    name: data.name,
    size,
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
    version: String(data.version ?? ''),
    modifiedTime: String(data.modifiedTime ?? ''),
    resourceKey: typeof data.resourceKey === 'string' ? data.resourceKey : undefined,
    canDownload: object(data.capabilities).canDownload === true,
  }
}
export class DriveClient {
  private token: () => string
  constructor(token: () => string) {
    this.token = token
  }
  private async request(
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
    resource?: { id: string; resourceKey?: string },
  ) {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token()}` }
    if (
      resource?.resourceKey &&
      /^[\w-]+$/.test(resource.id) &&
      /^[\w-]+$/.test(resource.resourceKey)
    )
      headers['X-Goog-Drive-Resource-Keys'] = `${resource.id}/${resource.resourceKey}`
    const response = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    if (!response.ok) throw new DriveError(response.status)
    return response
  }
  async account(signal: AbortSignal): Promise<DriveAccount> {
    const response = await this.request(
      'about',
      { fields: 'user(permissionId,displayName,emailAddress)' },
      signal,
    )
    const user = object(object(await response.json()).user)
    if (typeof user.permissionId !== 'string' || !user.permissionId)
      throw new Error('無法確認 Google 帳號，請重新連接。')
    return {
      id: user.permissionId,
      name: String(user.displayName ?? 'Google 帳號'),
      email: String(user.emailAddress ?? ''),
    }
  }
  async file(id: string, signal: AbortSignal, resourceKey?: string): Promise<DriveFile> {
    const response = await this.request(
      `files/${encodeURIComponent(id)}`,
      { fields, supportsAllDrives: 'true' },
      signal,
      { id, resourceKey },
    )
    return parseDriveFile(await response.json())
  }
  async list(signal: AbortSignal): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken = ''
    const pages = new Set<string>()
    do {
      if (pages.has(pageToken)) throw new Error('雲端清單分頁異常，請重試。')
      pages.add(pageToken)
      const response = await this.request(
        'files',
        {
          q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
          spaces: 'drive',
          pageSize: '1000',
          fields: `nextPageToken,files(${fields})`,
          ...(pageToken ? { pageToken } : {}),
        },
        signal,
      )
      const data = object(await response.json())
      if (!Array.isArray(data.files)) throw new Error('Google 回傳的書目清單不完整。')
      for (const value of data.files) {
        try {
          files.push(parseDriveFile(value))
        } catch {
          /* Ignore unsupported formats in the listing. */
        }
      }
      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : ''
    } while (pageToken)
    return files
  }
  async download(
    file: DriveFile,
    signal: AbortSignal,
    onProgress: (loaded: number) => void,
  ): Promise<File> {
    if (!file.canDownload) throw new Error('這本書的擁有者未允許下載。')
    if (file.size > MAX_IMPORT_BYTES) throw new Error('目前每本上限為 50 MB，這本書尚未下載。')
    const response = await this.request(
      `files/${encodeURIComponent(file.id)}`,
      { alt: 'media', supportsAllDrives: 'true' },
      signal,
      file,
    )
    const reader = response.body?.getReader()
    if (!reader) throw new Error('瀏覽器無法讀取下載內容，請重試。')
    const chunks: ArrayBuffer[] = []
    let loaded = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        loaded += value.byteLength
        if (loaded > MAX_IMPORT_BYTES) throw new Error('實際檔案超過 50 MB，已停止下載。')
        chunks.push(value.slice().buffer)
        onProgress(loaded)
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    if (loaded !== file.size) throw new Error('下載大小與雲端記錄不符，請重試。')
    return new File(chunks, file.name, { type: file.mimeType })
  }
}
