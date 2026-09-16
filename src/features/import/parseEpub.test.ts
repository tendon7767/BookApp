// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { makeEpub } from '../../../tests/fixtures/epub'
import { parseEpub } from './parseEpub'
import { readEntry, resolveArchivePath } from './epubArchive'

describe('EPUB import metadata', () => {
  it.each(['2.0', '3.0'] as const)(
    'reads EPUB %s metadata and a relative, percent-encoded cover',
    async (version) => {
      const result = await parseEpub((await makeEpub({ version })).buffer)
      expect(result.title).toBe('午後的書頁')
      expect(result.author).toBe('看書測試作者')
      expect(result.cover?.type).toBe('image/png')
      expect(result.warnings).toEqual([])
    },
  )
  it('accepts a publication without a cover', async () => {
    const result = await parseEpub((await makeEpub({ cover: false })).buffer)
    expect(result.cover).toBeNull()
    expect(result.title).toBe('午後的書頁')
  })
  it('handles external covers as missing without making network requests', async () => {
    const result = await parseEpub(
      (await makeEpub({ coverHref: 'https://example.invalid/cover.png' })).buffer,
    )
    expect(result.cover).toBeNull()
    expect(result.warnings).toHaveLength(1)
  })
  it('rejects archives missing their chapter files', async () => {
    await expect(parseEpub((await makeEpub({ missingChapter: true })).buffer)).rejects.toThrow(
      '缺少閱讀內容',
    )
  })
  it('rejects invalid ZIPs', async () => {
    await expect(parseEpub(new TextEncoder().encode('not an epub').buffer)).rejects.toThrow(
      '不是可讀取的 EPUB',
    )
  })
  it('does not parse XML entities', async () => {
    await expect(
      parseEpub(
        (await makeEpub({ opf: '<!DOCTYPE package [<!ENTITY a "data">]><package>&a;</package>' }))
          .buffer,
      ),
    ).rejects.toThrow('XML 宣告')
  })
  it('keeps title markup as inert text', async () => {
    const result = await parseEpub((await makeEpub({ title: '<img onerror=alert(1)>' })).buffer)
    expect(result.title).toBe('<img onerror=alert(1)>')
  })
  it('bounds inflated entry size', async () => {
    const zip = new JSZip()
    zip.file('large', 'a'.repeat(100_000))
    const packed = await JSZip.loadAsync(
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    )
    await expect(readEntry(packed.file('large'), 1024)).rejects.toThrow('過大')
  })
  it.each(['../../outside', 'https://example.com/x', '/absolute', '..%2F..%2Fx', 'a\\b', '%00x'])(
    'rejects unsafe paths %s',
    (path) => {
      expect(() => resolveArchivePath('OPS/package.opf', path)).toThrow()
    },
  )
})
