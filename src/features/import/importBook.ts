import type { BookMetadata } from '../../domain/book'
import { findBookByHash, saveImportedBook } from '../../storage/bookRepository'

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024
export type ImportResult = { book: BookMetadata; added: boolean; warnings: string[] }

export async function importBook(file: File): Promise<ImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'epub' && extension !== 'txt')
    throw new Error('目前可匯入 EPUB 與 TXT，其他格式稍後支援。')
  if (!file.size) throw new Error('這個檔案是空的，請重新選擇。')
  if (file.size > MAX_IMPORT_BYTES) throw new Error('目前每本上限為 50 MB，請選擇較小的檔案。')
  const buffer = await file.arrayBuffer()
  const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  const hash = Array.from(hashBytes, (value) => value.toString(16).padStart(2, '0')).join('')
  const existing = await findBookByHash(hash)
  if (existing && existing.downloaded !== false)
    return { book: existing, added: false, warnings: [] }
  const metadata =
    extension === 'epub' ? await (await import('./parseEpub')).parseEpub(buffer) : null
  const fallbackTitle = file.name.replace(/\.(epub|txt)$/i, '').trim() || '未命名書籍'
  const now = Date.now()
  const book: BookMetadata = {
    id: hash,
    title: metadata?.title || fallbackTitle,
    originalTitle: metadata?.title || fallbackTitle,
    author: metadata?.author || '',
    format: extension,
    category: null,
    createdAt: now,
    modifiedAt: now,
    fileName: file.name,
    fileHash: hash,
    fileSize: file.size,
    hasCover: !!metadata?.cover,
  }
  try {
    const result = await saveImportedBook(
      book,
      {
        bytes: buffer,
        mimeType: extension === 'epub' ? 'application/epub+zip' : file.type || 'text/plain',
      },
      metadata?.cover ?? null,
    )
    return { ...result, warnings: metadata?.warnings ?? [] }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('裝置儲存空間不足，這本書尚未加入。請先釋放空間再重試。')
    }
    throw error
  }
}
