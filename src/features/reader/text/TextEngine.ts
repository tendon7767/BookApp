import type { ReadingLocation, TextEncodingChoice } from '../../../domain/book'
import type { ReaderAdapter } from '../ReaderAdapter'
import { readerFonts, type ReadingSettings } from '../readingSettings'
import { boundaries, clampOffset, encodingChoice, type TextDocument } from './textDocument'

type TextLocation = Extract<ReadingLocation, { format: 'txt' }>
export interface TextPosition {
  offset: number
  percentage: number
  atStart: boolean
  atEnd: boolean
  href?: string
}
// Only a small page candidate is laid out, even for multi-megabyte books.
const WINDOW = 8192
export class TextEngine implements ReaderAdapter<TextLocation> {
  private host!: HTMLElement
  private page!: HTMLDivElement
  private file!: Blob
  private document: TextDocument | null = null
  private choice: TextEncodingChoice = 'auto'
  private start = 0
  private end = 0
  private history = new Map<number, number>()
  private observer?: ResizeObserver
  private worker?: Worker
  private cancelLoad?: () => void
  private disposed = false
  private size = ''
  private settings: ReadingSettings
  private report: (position: TextPosition, location: TextLocation, document: TextDocument) => void

  constructor(settings: ReadingSettings, report: TextEngine['report']) {
    this.settings = settings
    this.report = report
  }
  async open(file: Blob, host: HTMLElement, location?: TextLocation) {
    this.file = file
    this.host = host
    this.page = document.createElement('div')
    this.page.className = 'text-page'
    host.replaceChildren(this.page)
    this.style()
    this.choice = encodingChoice(location?.encodingChoice ?? location?.encoding)
    this.document = await this.decode(this.choice)
    if (this.disposed) return
    await document.fonts.ready
    if (this.disposed) return
    this.start = clampOffset(this.document.text, location?.characterOffset ?? 0)
    this.render()
    this.size = `${host.clientWidth},${host.clientHeight}`
    this.observer = new ResizeObserver(() => {
      const size = `${host.clientWidth},${host.clientHeight}`
      if (this.disposed || size === this.size) return
      this.size = size
      this.history.clear()
      this.render()
    })
    this.observer.observe(host)
  }
  private async decode(choice: TextEncodingChoice): Promise<TextDocument> {
    const bytes = await this.file.arrayBuffer()
    if (this.disposed) throw new Error('Reader closed')
    const worker = new Worker(new URL('./text.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    try {
      return await new Promise<TextDocument>((resolve, reject) => {
        this.cancelLoad = () => reject(new Error('Reader closed'))
        worker.onmessage = (event: MessageEvent<{ document?: TextDocument; error?: string }>) =>
          event.data.document ? resolve(event.data.document) : reject(new Error(event.data.error))
        worker.onerror = () => reject(new Error('TXT 解碼未能完成，請返回書架重試。'))
        worker.postMessage({ bytes, choice }, [bytes])
      })
    } finally {
      worker.terminate()
      this.worker = undefined
      this.cancelLoad = undefined
    }
  }
  private style() {
    const s = this.settings
    this.host.style.setProperty('--reader-margin', `${s.margin}px`)
    Object.assign(this.page.style, {
      fontFamily: readerFonts[s.fontFamily].css,
      fontSize: `${s.fontSize}px`,
      lineHeight: String(s.lineHeight),
    })
    this.page.style.setProperty('--paragraph-space', `${s.paragraphSpacing}em`)
  }
  private fill(text: string) {
    const fragment = document.createDocumentFragment()
    const lines = text.split('\n')
    // A trailing newline belongs to this page but doesn't create an extra empty paragraph.
    if (lines.length > 1 && lines.at(-1) === '') lines.pop()
    for (const line of lines) {
      const p = document.createElement('p')
      if (!line.trim()) p.className = 'text-blank'
      p.textContent = line || '\u200b'
      fragment.append(p)
    }
    this.page.replaceChildren(fragment)
  }
  private fit(text: string, backwards = false) {
    const cuts = boundaries(text)
    let low = 1,
      high = cuts.length - 1,
      best = 0
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const piece = backwards ? text.slice(cuts[cuts.length - 1 - mid]) : text.slice(0, cuts[mid])
      this.fill(piece)
      if (this.page.getBoundingClientRect().height <= this.host.clientHeight + 0.1) {
        best = mid
        low = mid + 1
      } else high = mid - 1
    }
    // A supported phone viewport always fits at least one line. Keep progress finite at tiny sizes.
    best = Math.max(1, best)
    return backwards ? text.length - cuts[Math.max(0, cuts.length - 1 - best)] : (cuts[best] ?? 0)
  }
  private render(endLimit?: number) {
    // WebKit can deliver a resize after React detaches the host, before effect cleanup.
    // A detached/zero-sized page must never overwrite the saved position as "finished".
    if (
      !this.document ||
      this.disposed ||
      !this.host.isConnected ||
      !this.host.clientWidth ||
      !this.host.clientHeight
    )
      return
    const text = this.document.text
    if (this.start >= text.length && text.length) {
      const from = clampOffset(text, Math.max(0, text.length - WINDOW))
      this.start = text.length - this.fit(text.slice(from), true)
    }
    let limit = clampOffset(text, Math.min(endLimit ?? text.length, this.start + WINDOW))
    if (limit < (endLimit ?? text.length)) {
      // Drop the last possibly incomplete grapheme at the bounded candidate's edge.
      const cuts = boundaries(text.slice(this.start, limit))
      limit = this.start + (cuts.at(-2) ?? 0)
    }
    this.end = this.start + this.fit(text.slice(this.start, limit))
    this.fill(text.slice(this.start, this.end))
    this.host.dataset.start = String(this.start)
    this.host.dataset.end = String(this.end)
    let href: string | undefined
    for (const item of this.document.toc) {
      if (Number(item.href) > this.start) break
      href = item.href
    }
    this.report(
      {
        offset: this.start,
        percentage: this.end >= text.length ? 1 : this.start / text.length,
        atStart: this.start === 0,
        atEnd: this.end >= text.length,
        href,
      },
      {
        format: 'txt',
        characterOffset: this.start,
        textVersion: 1,
        encoding: this.document.encoding,
        encodingChoice: this.choice,
      },
      this.document,
    )
  }
  async navigate(location: TextLocation) {
    if (!this.document) return
    this.start = clampOffset(this.document.text, location.characterOffset)
    this.history.clear()
    this.render()
  }
  async next() {
    if (!this.document || this.end >= this.document.text.length) return
    this.history.set(this.end, this.start)
    if (this.history.size > 500) this.history.delete(this.history.keys().next().value!)
    this.start = this.end
    this.render()
  }
  async previous() {
    if (!this.document || !this.start) return
    const end = this.start
    const known = this.history.get(end)
    const from = clampOffset(this.document.text, Math.max(0, end - WINDOW))
    this.start = known ?? end - this.fit(this.document.text.slice(from, end), true)
    this.render(end)
  }
  async seek(percentage: number) {
    if (!this.document) return
    await this.navigate({
      format: 'txt',
      characterOffset: Math.floor(this.document.text.length * percentage),
    })
  }
  async applySettings(settings: ReadingSettings) {
    this.settings = settings
    this.style()
    await document.fonts.ready
    this.history.clear()
    this.render()
  }
  async changeEncoding(choice: TextEncodingChoice) {
    const ratio = this.document ? this.start / Math.max(1, this.document.text.length) : 0
    const decoded = await this.decode(choice)
    if (this.disposed) return
    this.document = decoded
    this.choice = choice
    this.start = clampOffset(decoded.text, Math.floor(decoded.text.length * ratio))
    this.history.clear()
    this.render()
  }
  destroy() {
    this.disposed = true
    this.observer?.disconnect()
    this.cancelLoad?.()
    this.worker?.terminate()
    this.host?.replaceChildren()
  }
}
