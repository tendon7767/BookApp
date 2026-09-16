import JSZip from 'jszip'
import { makeEpub } from './epub.ts'

export async function makeReadingEpub(version: '2.0' | '3.0' = '3.0') {
  const zip = await JSZip.loadAsync(await makeEpub({ version, cover: false }))
  const opf = await zip.file('OPS/package.opf')!.async('string')
  zip.file(
    'OPS/package.opf',
    opf
      .replace(
        '</manifest>',
        '<item id="second" href="second.xhtml" media-type="application/xhtml+xml"/></manifest>',
      )
      .replace('</spine>', '<itemref idref="second"/></spine>'),
  )
  for (const [file, name] of [
    ['chapter', '第一章'],
    ['second', '第二章'],
  ]) {
    zip.file(
      `OPS/${file}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${name}</title></head><body><h1>${name}</h1>${Array.from({ length: 90 }, (_, i) => `<p>${name}第${i + 1}段。${'這是測試分頁與閱讀位置的原創文字，沿著小路走向山上的圖書館。'.repeat(4)}</p>`).join('')}</body></html>`,
    )
  }
  zip.file(
    'OPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目錄</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">第一章</a></li><li><a href="second.xhtml">第二章</a></li></ol></nav></body></html>',
  )
  const ncx = await zip.file('OPS/toc.ncx')!.async('string')
  zip.file(
    'OPS/toc.ncx',
    ncx.replace(
      '</navMap>',
      '<navPoint id="c2" playOrder="2"><navLabel><text>第二章</text></navLabel><content src="second.xhtml"/></navPoint></navMap>',
    ),
  )
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}
