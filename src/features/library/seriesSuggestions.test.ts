import { expect, it } from 'vitest'
import type { BookMetadata } from '../../domain/book'
import { commonTitleText, titleVolume, suggestSeries } from './seriesSuggestions'

const book = (title: string, extra: Partial<BookMetadata> = {}): BookMetadata => ({
  id: title,
  title,
  originalTitle: title,
  author: '',
  format: 'txt',
  category: null,
  fileName: title + '.txt',
  fileHash: title,
  fileSize: 1,
  hasCover: false,
  createdAt: 1,
  modifiedAt: 1,
  ...extra,
})

it('uses common title text with no matching-series or numeric-suffix gates', () => {
  expect(suggestSeries([book('山城故事01'), book('山城故事02')])).toMatchObject({
    name: '山城故事0',
    volumes: { 山城故事01: '1', 山城故事02: '2' },
  })
  expect(suggestSeries([book('山城故事 第十二集'), book('山城故事 第十三集')]).name).toBe(
    '山城故事 第十',
  )
  expect(suggestSeries([book('小說 山城1'), book('小說 遠行2')]).name).toBe('小說 ')
  expect(suggestSeries([book('山城故事 01')]).name).toBe('山城故事 01')
  expect(suggestSeries([book('三體01'), book('三體02')]).name).toBe('三體0')
  expect(suggestSeries([book('年度紀錄2024'), book('年度紀錄2025')])).toMatchObject({
    name: '年度紀錄202',
    volumes: { 年度紀錄2024: '2024', 年度紀錄2025: '2025' },
  })
})
it('finds shared text in the middle and across every selected book', () => {
  expect(commonTitleText(['甲版-山城故事01', '乙版-山城故事02', '丙版-山城故事03'])).toBe(
    '版-山城故事0',
  )
  expect(commonTitleText(['abcXYZ', 'abc123XYZ', 'qXYZ'])).toBe('XYZ')
  expect(commonTitleText(['甲', '乙'])).toBe('')
  expect(commonTitleText([])).toBe('')
})
it.each([
  ['山城02', 2],
  ['年度紀錄2024', 2024],
  ['山城 第12章', 12],
  ['Story Vol. 0', 0],
  ['Story Volume 2.5', 2.5],
  ['三體０３', 3],
  ['山城第一百零二卷', 102],
  ['山城第十二集', 12],
  ['2024 故事 3', 2024],
  ['番外', null],
])('reads numbers directly from %s', (title, expected) => expect(titleVolume(title)).toBe(expected))
it('uses book titles only and preserves saved user edits', () => {
  expect(suggestSeries([book('歸途', { fileName: 'STORY Vol. 2.epub' })])).toMatchObject({
    name: '歸途',
    volumes: { 歸途: '' },
  })
  expect(
    suggestSeries([
      book('山城 第1集', { series: '我的系列', volume: 9 }),
      book('山城 第2集', { series: '我的系列', volume: null }),
    ]),
  ).toEqual({
    name: '我的系列',
    volumes: { '山城 第1集': '9', '山城 第2集': '' },
    suggested: false,
  })
})

it('keeps punctuation, whitespace, full-width characters and number fragments verbatim', () => {
  for (const title of ['  《ＡＢＣ 第十二集》 -  ', 'My Book', '三國演義'])
    expect(suggestSeries([book(title)]).name).toBe(title)
  expect(suggestSeries([book('《故事》1'), book('《故事》2')]).name).toBe('《故事》')
  expect(suggestSeries([book('契約皇后的女兒1 - ABCD'), book('契約皇后的女兒2 - ABCD')]).name).toBe(
    '契約皇后的女兒',
  )
  expect(
    suggestSeries([book('契約皇后的女兒1  - ABCD'), book('契約皇后的女兒2  - ABCD')]).name,
  ).toBe('  - ABCD')
})
