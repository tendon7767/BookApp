import type { TextEncoding, TextEncodingChoice } from '../../../domain/book'
import type { TocEntry } from '../TocDialog'

export const encodingLabels: Record<TextEncodingChoice, string> = {
  auto: '自動辨識',
  'utf-8': 'UTF-8',
  big5: 'Big5（繁體）',
  gb18030: 'GB18030 / GBK（簡體）',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
}
export interface TextDocument {
  text: string
  encoding: TextEncoding
  guessed: boolean
  replacements: boolean
  toc: TocEntry[]
}
export function encodingChoice(value: unknown): TextEncodingChoice {
  return typeof value === 'string' && Object.hasOwn(encodingLabels, value)
    ? (value as TextEncodingChoice)
    : 'auto'
}

// A conservative fallback, not a guarantee: Big5 and GBK often both decode successfully.
// Common prose characters help rank candidates; the reader always allows an override.
const common = new Set(
  '的一是不了在人有我他這这个們们中來来上大為为和國国地到以說说時时要就出會会可也你對对生能而子那得於于著着下自之年過过發发後后作裡里用道行所然家種种事成方多經经麼么去法學学如都同現现當当沒没動动面起看定天分還还進进好小部其些主樣样理心她本前開开但因只從从想實实日軍军者意無无力它與与長长把機机十民第公此已工使情明性知全三又關关點点正業业外將将兩两高間间由問问很最重並并物手應应戰战向頭头文體体政美相見见被利什二等產产或新己制身果加西斯月話话合回特代內内信表化老給给世位次度門门任常先海通教兒儿原東东聲声提立及比員员解水名真論论處处走義义各入幾几口認认條条平系氣气題题活爾尔更別别打女變变四神總总何電电數数安少報报才結结反受目太量再感建務务做接必場场件計计管期市直德資资命山金指克許许統统區区保至隊队形社便空決决治展馬马科司五基眼書书非則则聽听白卻却界達达光放強强即像難难且權权思王象完設设式色路記记南品住告類类求據据程北邊边死張张該该交規规萬万取拉格望覺觉術术領领共確确傳传師师觀观清今切院讓让識识候帶带導导爭争運运笑飛飞風风步改收根言連连往商轉转容流告足叫聖圣花愛爱夜夢梦章回',
)
function score(text: string): number {
  let value = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (common.has(char)) value += 3
    else if (char === '\ufffd' || (code < 32 && !'\r\n\t'.includes(char))) value -= 30
    else if (code >= 0xe000 && code <= 0xf8ff) value -= 5
  }
  return value
}
export function decodeText(bytes: Uint8Array, choice: TextEncodingChoice = 'auto'): TextDocument {
  let encoding: TextEncoding = choice === 'auto' ? 'utf-8' : choice
  let guessed = false
  let decoded: string | undefined
  if (choice === 'auto') {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le'
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be'
    else {
      // BOM-less UTF-16 with ASCII punctuation or headings.
      const sample = bytes.subarray(0, 65536)
      let even = 0,
        odd = 0
      for (let i = 0; i < sample.length; i++)
        if (sample[i] === 0) {
          if (i % 2) odd++
          else even++
        }
      if (odd > sample.length * 0.15 && even < odd / 4) {
        encoding = 'utf-16le'
        guessed = true
      } else if (even > sample.length * 0.15 && odd < even / 4) {
        encoding = 'utf-16be'
        guessed = true
      } else {
        try {
          decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          guessed = true
          const candidates: TextEncoding[] = ['big5', 'gb18030']
          // Streaming avoids scoring a replacement character at a truncated sample boundary.
          encoding = candidates.sort(
            (a, b) =>
              score(new TextDecoder(b).decode(sample, { stream: true })) -
              score(new TextDecoder(a).decode(sample, { stream: true })),
          )[0]
        }
      }
    }
  }
  let replacements = false
  try {
    decoded ??= new TextDecoder(encoding, { fatal: true }).decode(bytes)
  } catch {
    decoded = new TextDecoder(encoding).decode(bytes)
    replacements = true
  }
  const text = decoded.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n')
  return { text, encoding, guessed, replacements, toc: findChapters(text) }
}

export function findChapters(text: string): TocEntry[] {
  const entries: TocEntry[] = []
  // Bounded line length prevents a huge unbroken line from becoming a title.
  const pattern =
    /^[\t \u3000]*(?:第[\t \u3000]*[零〇一二三四五六七八九十百千萬万兩两壹貳贰參叁肆伍陸陆柒捌玖拾佰仟0-9０-９]+[\t \u3000]*[章回卷節节部]|chapter\s+[0-9ivxlcdm]+\b|序章|序言|楔子|終章|终章|尾聲|尾声|後記|后记)[^\n]{0,70}$/gim
  for (const match of text.matchAll(pattern))
    entries.push({ label: match[0].trim(), href: String(match.index) })
  return entries
}

// Never cut a Unicode grapheme (surrogates, combining accents or emoji sequences).
export function boundaries(text: string): number[] {
  const result = [0]
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text))
    result.push(part.index + part.segment.length)
  return result
}
export function clampOffset(text: string, offset: number): number {
  let result = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.floor(offset) : 0))
  if (result > 0 && result < text.length && /[\udc00-\udfff]/.test(text[result])) result--
  return result
}
