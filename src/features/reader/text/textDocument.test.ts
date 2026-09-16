import { expect, it } from 'vitest'
import { boundaries, clampOffset, decodeText, encodingChoice, findChapters } from './textDocument'

it('decodes UTF-8/BOM and normalizes newlines without changing the source', () => {
  const bytes = new TextEncoder().encode('\ufeff第一章\r\n你好🌿\r第二章\n故事')
  const saved = bytes.slice()
  const doc = decodeText(bytes)
  expect(doc.encoding).toBe('utf-8')
  expect(doc.text).toBe('第一章\n你好🌿\n第二章\n故事')
  expect(bytes).toEqual(saved)
  expect(doc.toc[1].href).toBe(String(doc.text.indexOf('第二章')))
})
it.each([
  ['big5', [0xb4, 0xfa, 0xb8, 0xd5], '測試'],
  ['gb18030', [0xb2, 0xe2, 0xca, 0xd4], '测试'],
] as const)('supports explicit %s without lossy re-encoding', (encoding, bytes, expected) => {
  expect(decodeText(new Uint8Array(bytes), encoding).text).toBe(expected)
})
it.each([
  ['utf-16le', [0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]],
  ['utf-16be', [0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87]],
] as const)('detects %s BOM', (encoding, bytes) => {
  const doc = decodeText(new Uint8Array(bytes))
  expect(doc.encoding).toBe(encoding)
  expect(doc.text).toBe('中文')
})
it('ranks common Chinese prose and marks legacy guesses', () => {
  // Big5: 第一章 followed by common prose; GBK: 第一章.
  expect(decodeText(new Uint8Array([0xb2, 0xc4, 0xa4, 0x40, 0xb3, 0xb9])).encoding).toBe('big5')
  const gb = decodeText(new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2]))
  expect(gb.encoding).toBe('gb18030')
  expect(gb.guessed).toBe(true)
  expect(decodeText(new Uint8Array([0xff]), 'utf-8').replacements).toBe(true)
})
it('does not mistake a literal replacement glyph in a valid source for a decoding error', () => {
  expect(decodeText(new TextEncoder().encode('原檔已含有 � 字元')).replacements).toBe(false)
})
it('recognizes Chinese and English headings with exact offsets and ignores prose', () => {
  const lines = [
    '第一章 初見',
    '一般內文中提到第二章，不是標題。',
    '  第十二章',
    '第1回',
    '第２回 夜色',
    'Chapter 1: Dawn',
    'CHAPTER IV',
    '楔子',
    '第十三章' + '很長的內文'.repeat(40),
  ]
  const text = lines.join('\n')
  expect(findChapters(text).map((item) => item.label)).toEqual([
    lines[0],
    lines[2].trim(),
    ...lines.slice(3, 8),
  ])
  for (const item of findChapters(text))
    expect(text.slice(Number(item.href)).trimStart()).toMatch(new RegExp('^' + item.label))
})
it('keeps grapheme boundaries and clamps invalid locations safely', () => {
  const text = 'A👨‍👩‍👧‍👦e\u0301中'
  const cuts = boundaries(text)
  expect(cuts.slice(1).map((end, i) => text.slice(cuts[i], end))).toEqual([
    'A',
    '👨‍👩‍👧‍👦',
    'e\u0301',
    '中',
  ])
  expect(clampOffset('A🌿B', 2)).toBe(1)
  expect(clampOffset('abc', NaN)).toBe(0)
  expect(clampOffset('abc', 100)).toBe(3)
  expect(encodingChoice('constructor')).toBe('auto')
})
