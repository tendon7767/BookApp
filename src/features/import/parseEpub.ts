import JSZip from 'jszip'
import { rasterMime, readEntry, readXml, resolveArchivePath } from './epubArchive'

export interface EpubMetadata {
  title: string
  author: string
  cover: Blob | null
  warnings: string[]
}

export async function parseEpub(buffer: ArrayBuffer): Promise<EpubMetadata> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('這個檔案不是可讀取的 EPUB，或檔案已損壞。')
  }
  if (Object.keys(zip.files).length > 20_000)
    throw new Error('這本 EPUB 的檔案數量過多，目前無法匯入。')
  const mime = new TextDecoder().decode(await readEntry(zip.file('mimetype'), 100)).trim()
  if (mime !== 'application/epub+zip') throw new Error('檔案內容不是 EPUB 電子書。')
  const container = await readXml(zip.file('META-INF/container.xml'), 256 * 1024)
  const roots = Array.from(container.getElementsByTagNameNS('*', 'rootfile'))
  const root =
    roots.find((item) => item.getAttribute('media-type') === 'application/oebps-package+xml') ??
    roots[0]
  const opfPath = resolveArchivePath('', root?.getAttribute('full-path') ?? '')
  const document = await readXml(zip.file(opfPath))
  const pkg = document.documentElement
  if (pkg.localName !== 'package' || !/^[23](\.|$)/.test(pkg.getAttribute('version') ?? '')) {
    throw new Error('目前僅支援 EPUB 2 與 EPUB 3。')
  }
  const metadata = pkg.getElementsByTagNameNS('*', 'metadata')[0]
  const title =
    metadata
      ?.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]
      ?.textContent?.trim() ?? ''
  const creators = metadata
    ? Array.from(metadata.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator'))
    : []
  const author = creators
    .map((item) => item.textContent?.trim())
    .filter(Boolean)
    .join('、')
  const manifest = pkg.getElementsByTagNameNS('*', 'manifest')[0]
  const items = manifest ? Array.from(manifest.getElementsByTagNameNS('*', 'item')) : []
  const spine = pkg.getElementsByTagNameNS('*', 'spine')[0]
  const chapters = spine ? Array.from(spine.getElementsByTagNameNS('*', 'itemref')) : []
  if (
    !chapters.length ||
    chapters.some((chapter) => {
      const item = items.find((entry) => entry.getAttribute('id') === chapter.getAttribute('idref'))
      return !item || !zip.file(resolveArchivePath(opfPath, item.getAttribute('href') ?? ''))
    })
  )
    throw new Error('EPUB 缺少閱讀內容或章節檔案。')

  const warnings: string[] = []
  const legacyId = metadata
    ? Array.from(metadata.getElementsByTagNameNS('*', 'meta'))
        .find((meta) => meta.getAttribute('name') === 'cover')
        ?.getAttribute('content')
    : null
  const coverItem =
    items.find((item) => item.getAttribute('properties')?.split(/\s+/).includes('cover-image')) ??
    items.find((item) => legacyId && item.getAttribute('id') === legacyId)
  let cover: Blob | null = null
  if (coverItem) {
    try {
      const path = resolveArchivePath(opfPath, coverItem.getAttribute('href') ?? '')
      const bytes = await readEntry(zip.file(path), 4 * 1024 * 1024)
      const type = rasterMime(bytes)
      if (type) cover = new Blob([bytes], { type })
      else warnings.push('封面格式暫不支援，已使用預設封面。')
    } catch {
      warnings.push('封面無法讀取，已使用預設封面。')
    }
  }
  return { title: title.slice(0, 1000), author: author.slice(0, 1000), cover, warnings }
}
