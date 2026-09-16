import type { BookMetadata } from '../../domain/book'

function chineseNumber(token: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token)
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    兩: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }
  if (!/[十百千]/u.test(token)) {
    if ([...token].some((c) => digits[c] === undefined)) return null
    return Number([...token].map((c) => digits[c]).join(''))
  }
  let value = 0,
    digit: number | null = null,
    previousUnit = 10000
  for (const c of token) {
    if (units[c]) {
      if (units[c] >= previousUnit || (digit === null && c !== '十')) return null
      value += (digit ?? 1) * units[c]
      previousUnit = units[c]
      digit = null
    } else {
      if (digits[c] === undefined || (digit !== null && digit !== 0)) return null
      digit = digits[c]
    }
  }
  return value + (digit ?? 0)
}

// Find a literal shared part anywhere in the selected titles, not only a prefix.
export function commonTitleText(titles: string[]): string {
  if (!titles.length) return ''
  const shortest = [...titles].sort((a, b) => a.length - b.length)[0]
  const characters = Array.from(shortest)
  for (let length = characters.length; length > 0; length--) {
    for (let start = 0; start <= characters.length - length; start++) {
      const candidate = characters.slice(start, start + length).join('')
      if (titles.every((title) => title.includes(candidate))) return candidate
    }
  }
  return ''
}

export function titleVolume(title: string): number | null {
  const text = title.normalize('NFKC')
  const numeric = text.match(/[0-9]+(?:\.[0-9]+)?/)
  if (numeric) return Number(numeric[0])
  const chinese = text.match(/[零〇一二兩两三四五六七八九十百千]+/u)
  return chinese ? chineseNumber(chinese[0]) : null
}

export function suggestSeries(books: BookMetadata[]) {
  const existing = books[0]?.series
  const common = commonTitleText(books.map((b) => b.title))
  const name = existing && books.every((b) => b.series === existing) ? existing : common
  let suggested = !!name && books.some((b) => b.series !== name)
  const volumes = Object.fromEntries(
    books.map((b) => {
      const volume = b.volume ?? (b.series ? null : titleVolume(b.title))
      if (b.volume == null && volume != null) suggested = true
      return [b.id, volume?.toString() ?? '']
    }),
  )
  return { name, volumes, suggested }
}
