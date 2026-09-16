import JSZip from 'jszip'

// Small, original test publication. No user books are checked into this repository.
export const coverPng = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=',
  ),
  (character) => character.charCodeAt(0),
)
const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export async function makeEpub(
  options: {
    version?: '2.0' | '3.0'
    title?: string
    author?: string
    cover?: boolean
    coverHref?: string
    missingChapter?: boolean
    opf?: string
  } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const zip = new JSZip()
  const version = options.version ?? '3.0'
  const cover = options.cover ?? true
  const title = escapeXml(options.title ?? '午後的書頁')
  const author = escapeXml(options.author ?? '看書測試作者')
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  )
  const coverHref = escapeXml(options.coverHref ?? '../Art/%E5%B0%81%E9%9D%A2.png')
  zip.file(
    'OPS/package.opf',
    options.opf ??
      `<?xml version="1.0" encoding="UTF-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="book-id">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="book-id">urn:uuid:test-kanshu</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>zh-Hant</dc:language>
        ${version === '2.0' ? '<meta name="cover" content="cover"/>' : '<meta property="dcterms:modified">2026-09-17T00:00:00Z</meta>'}
      </metadata>
      <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
        ${version === '3.0' ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'}
        ${cover ? `<item id="cover" href="${coverHref}" media-type="image/png" ${version === '3.0' ? 'properties="cover-image"' : ''}/>` : ''}
      </manifest><spine ${version === '2.0' ? 'toc="ncx"' : ''}><itemref idref="chapter"/></spine>
    </package>`,
  )
  if (!options.missingChapter)
    zip.file(
      'OPS/chapter.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章 午後</h1><p>窗邊，一本書翻開了新的故事。</p></body></html>',
    )
  zip.file(
    'OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目錄</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">第一章</a></li></ol></nav></body></html>',
  )
  zip.file(
    'OPS/toc.ncx',
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:test-kanshu"/></head><docTitle><text>測試書</text></docTitle><navMap><navPoint id="c1" playOrder="1"><navLabel><text>第一章</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>',
  )
  if (cover) zip.file('Art/封面.png', coverPng)
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
}
