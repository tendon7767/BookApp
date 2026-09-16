import type JSZip from 'jszip'

// JSZip 3 exposes this documented API but omits it from JSZipObject's shipped types.
interface StreamableZipEntry extends JSZip.JSZipObject {
  internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>
}

export async function readEntry(
  entry: JSZip.JSZipObject | null,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!entry) throw new Error('EPUB 缺少必要檔案，請確認原檔完整。')
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Uint8Array[] = []
    const stream = (entry as StreamableZipEntry).internalStream('uint8array')
    stream.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        stream.pause()
        chunks.length = 0
        reject(new Error('EPUB 內的書籍資訊或封面過大，無法安全處理。'))
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      resolve(bytes)
    })
    stream.resume()
  })
}

export async function readXml(
  entry: JSZip.JSZipObject | null,
  limit = 1024 * 1024,
): Promise<Document> {
  const bytes = await readEntry(entry, limit)
  // EPUB package/container XML use UTF-8 or UTF-16. Do not load external entities.
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8'
  const xml = new TextDecoder(encoding, { fatal: true }).decode(bytes)
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('EPUB 書籍資訊包含不支援的 XML 宣告。')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagNameNS('*', 'parsererror').length) {
    throw new Error('EPUB 的書籍資訊格式不完整。')
  }
  return document
}

// Resolve only paths inside the archive. No fetch, external URLs, or zip-root traversal.
export function resolveArchivePath(base: string, reference: string): string {
  let path: string
  try {
    path = decodeURIComponent(reference.split(/[?#]/, 1)[0])
  } catch {
    throw new Error('EPUB 的檔案路徑無法辨識。')
  }
  if (
    !path ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/i.test(path)
  ) {
    throw new Error('EPUB 使用了不支援的外部檔案路徑。')
  }
  const parts = base ? base.split('/').slice(0, -1) : []
  for (const part of path.split('/')) {
    if (part === '..') {
      if (!parts.length) throw new Error('EPUB 的檔案路徑超出書籍範圍。')
      parts.pop()
    } else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

export function rasterMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const prefix = String.fromCharCode(...bytes.slice(0, 12))
  if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return 'image/gif'
  if (prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP') return 'image/webp'
  return null
}
