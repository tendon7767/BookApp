import { Book, type Contents, type Location, type NavItem, type Rendition } from 'epubjs'
import type Section from 'epubjs/types/section'
import type { ReaderAdapter } from '../ReaderAdapter'
import type { ReadingLocation } from '../../../domain/book'
import { parseReadingSettings, type ReadingSettings } from '../readingSettings'
import { readingStyles } from './readingStyles'
import type { ReaderSearchResult } from '../search'

export interface EpubPosition {
  cfi: string
  percentage: number | null
  href: string
  atStart: boolean
  atEnd: boolean
}
export type Gesture = 'next' | 'previous' | 'toggle'
interface ReaderCallbacks {
  position: (position: EpubPosition) => void
  warning: (message: string) => void
}

// Applied before serialization, so CFI generation and displayed content use the same DOM.
function restrictDocument(doc: Document) {
  doc
    .querySelectorAll('script, iframe, object, embed, form, meta[http-equiv]')
    .forEach((el) => el.remove())
  const policy = doc.createElement('meta')
  policy.setAttribute('http-equiv', 'Content-Security-Policy')
  policy.setAttribute(
    'content',
    "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src blob: data:; base-uri 'self'; form-action 'none'",
  )
  doc.querySelector('head')?.prepend(policy)
}

export class EpubEngine implements ReaderAdapter<Extract<ReadingLocation, { format: 'epub' }>> {
  private book = new Book({ replacements: 'blobUrl' })
  private rendition?: Rendition
  private disposed = false
  private ready = false
  private indexed = false
  private latest?: Location
  private observer?: ResizeObserver
  private opening?: Promise<void>
  private indexing?: Promise<void>
  private action: Promise<void> = Promise.resolve()
  private callbacks: ReaderCallbacks
  private settings: ReadingSettings
  private host?: HTMLElement
  private size = { width: 0, height: 0 }
  private reflowing = false
  private changing = false
  private anchor?: string
  private anchored = false

  constructor(callbacks: ReaderCallbacks, settings: ReadingSettings) {
    this.callbacks = callbacks
    this.settings = parseReadingSettings(settings)
    this.book.spine.hooks.content.register(restrictDocument)
  }

  open(file: Blob, host: HTMLElement, location?: Extract<ReadingLocation, { format: 'epub' }>) {
    this.opening = this.start(file, host, location)
    return this.opening
  }

  private async start(
    file: Blob,
    host: HTMLElement,
    location?: Extract<ReadingLocation, { format: 'epub' }>,
  ) {
    await this.book.open(await file.arrayBuffer(), 'binary')
    if (this.disposed) return
    this.host = host
    host.style.setProperty('--reader-margin', `${this.settings.margin}px`)
    if (this.book.packaging.metadata.layout === 'pre-paginated')
      throw new Error('這本是固定版面 EPUB，目前先支援可重排文字的 EPUB。')
    const options = {
      width: host.clientWidth,
      height: host.clientHeight,
      flow: 'paginated',
      spread: 'none',
      manager: 'default',
      allowScriptedContent: false,
      // Supported by the epub.js manager but omitted from its published types.
      gap: 0,
    }
    const rendition = this.book.renderTo(host, options)
    this.rendition = rendition
    this.anchor = location?.cfi
    this.anchored = !!location
    rendition.hooks.content.register((contents: Contents) => {
      contents.addStylesheetCss(readingStyles(this.settings), 'kanshu-reader')
    })
    rendition.on('relocated', (position: Location) => {
      if (this.disposed) return
      this.latest = position
      if (!this.reflowing && !this.changing) {
        if (!this.anchored) this.anchor = position.start.cfi
        if (this.ready) this.emitPosition()
      }
    })
    try {
      await this.display(location?.cfi)
      if (location) await this.settleAndRestore(location.cfi)
    } catch (error) {
      if (!location || this.disposed) throw error
      this.callbacks.warning('上次的位置無法還原，已回到書籍開頭。')
      this.anchored = false
      this.anchor = undefined
      await this.display()
    }
    if (this.disposed) return
    this.ready = true
    this.emitPosition()
    this.size = { width: host.clientWidth, height: host.clientHeight }
    this.observer = new ResizeObserver(() => {
      if (
        !this.disposed &&
        host.clientWidth &&
        host.clientHeight &&
        (host.clientWidth !== this.size.width || host.clientHeight !== this.size.height)
      )
        void this.run(() => this.reflow(this.settings)).catch(() =>
          this.callbacks.warning('畫面重排未完成，請返回書架後重新開書。'),
        )
    })
    this.observer.observe(host)
  }

  async toc(): Promise<NavItem[]> {
    return (await this.book.loaded.navigation).toc
  }

  async search(query: string): Promise<ReaderSearchResult[]> {
    const term = query.trim()
    if (!term || this.disposed) return []
    await this.indexing?.catch(() => undefined)
    const sections: Section[] = []
    this.book.spine.each((section: Section) => {
      if (section.linear) sections.push(section)
    })
    const results: ReaderSearchResult[] = []
    for (const section of sections) {
      if (this.disposed || results.length >= 100) break
      try {
        await section.load(this.book.load.bind(this.book))
        const matches = section.find(term) as unknown as Array<{ cfi: string; excerpt: string }>
        for (const match of matches) {
          if (results.length >= 100) break
          results.push({
            id: `${section.index}:${results.length}:${match.cfi}`,
            location: { format: 'epub', cfi: match.cfi },
            excerpt: match.excerpt.replace(/\s+/g, ' ').trim(),
          })
        }
      } finally {
        section.unload()
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    return results
  }

  prepareLocations(cache: string | undefined, save: (value: string) => Promise<void>) {
    this.indexing = this.index(cache, save)
    return this.indexing
  }

  private async index(cache: string | undefined, save: (value: string) => Promise<void>) {
    if (this.disposed) return
    if (cache) {
      try {
        const parsed: unknown = JSON.parse(cache)
        if (
          Array.isArray(parsed) &&
          parsed.length &&
          parsed.every((cfi) => typeof cfi === 'string' && cfi.startsWith('epubcfi('))
        ) {
          this.book.locations.load(cache)
          this.indexed = true
          this.emitPosition()
          return
        }
      } catch {
        /* Rebuild a damaged disposable index. */
      }
    }
    // Process one section at a time so closing a large book stops indexing promptly.
    const sections: Section[] = []
    this.book.spine.each((section: Section) => {
      if (section.linear) sections.push(section)
    })
    for (const section of sections) {
      if (this.disposed) return
      await this.book.locations.process(section)
    }
    if (this.disposed) return
    const serialized = this.book.locations.save()
    this.book.locations.load(serialized)
    this.indexed = this.book.locations.length() > 0
    this.emitPosition()
    await save(serialized)
  }

  private emitPosition() {
    if (this.disposed || this.reflowing || !this.latest?.start?.cfi) return
    const loc = this.latest
    const cfi = this.anchor ?? loc.start.cfi
    const ratio = this.indexed ? this.book.locations.percentageFromCfi(cfi) : null
    this.callbacks.position({
      cfi,
      href: loc.start.href,
      percentage: loc.atEnd
        ? 1
        : ratio === null || !Number.isFinite(ratio)
          ? null
          : Math.min(1, Math.max(0, ratio)),
      atStart: loc.atStart,
      atEnd: loc.atEnd,
    })
  }

  private async display(target?: string): Promise<void> {
    // Detect missing chapters/stale CFIs before enqueueing a render. epub.js 0.3
    // emits displayError without rejecting its queue for some malformed sections.
    const section = this.book.spine.get(target)
    if (!section) throw new Error('找不到章節')
    await section.load(this.book.load.bind(this.book))
    if (target?.startsWith('epubcfi(')) await this.book.getRange(target)
    if (this.disposed) return
    await this.withLocation(() => this.rendition!.display(target))
  }

  private withLocation(task: () => Promise<void>): Promise<void> {
    const rendition = this.rendition!
    return new Promise((resolve, reject) => {
      const fail = () => finish(new Error('無法顯示這個章節，檔案可能損壞或格式不支援。'))
      const timer = setTimeout(fail, 15000)
      let taskDone = false
      const relocated = () => {
        if (taskDone) finish()
      }
      const finish = (error?: unknown) => {
        clearTimeout(timer)
        rendition.off('displayError', fail)
        rendition.off('relocated', relocated)
        if (error) reject(error)
        else resolve()
      }
      rendition.on('displayError', fail)
      rendition.on('relocated', relocated)
      // Wait for relocated, not just display(): location reporting is scheduled on RAF.
      void task().then(() => {
        taskDone = true
        void rendition.reportLocation().catch(finish)
      }, finish)
    })
  }

  private run(task: () => Promise<void>) {
    this.action = this.action
      .catch(() => undefined)
      .then(async () => {
        if (!this.disposed && this.ready) await task()
      })
    return this.action
  }
  applySettings(settings: ReadingSettings) {
    return this.run(() => this.reflow(parseReadingSettings(settings)))
  }
  private async reflow(settings: ReadingSettings) {
    if (!this.host || !this.rendition || this.disposed) return
    const anchor = this.anchor ?? this.latest?.start.cfi
    this.anchored = true
    this.reflowing = true
    try {
      this.settings = settings
      this.host.style.setProperty('--reader-margin', `${settings.margin}px`)
      this.size = { width: this.host.clientWidth, height: this.host.clientHeight }
      this.rendition.resize(this.size.width, this.size.height)
      // Recreate the current view so publisher CSS is overridden before measuring columns.
      this.rendition.clear()
      await this.display(anchor)
      if (anchor) await this.settleAndRestore(anchor)
      this.anchor = anchor ?? this.latest?.start.cfi
    } finally {
      this.reflowing = false
      this.emitPosition()
    }
  }
  private async settleAndRestore(anchor: string) {
    // Content hooks run after the first view is laid out. Restore once the injected
    // typography and font metrics have actually changed its CSS columns.
    const contents = this.rendition!.getContents() as unknown as Contents[]
    await Promise.all(contents.map((content) => content.document.fonts?.ready))
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    if (!this.disposed) await this.display(anchor)
  }
  private async changePage(task: () => Promise<void>) {
    const host = this.host
    const visibility = host?.style.visibility
    const oldHref = this.latest?.start.href
    // epub.js can briefly expose a column before its fonts and location have
    // settled. Keep its iframe out of paint until the final column is known.
    if (host) host.style.visibility = 'hidden'
    this.changing = true
    try {
      await task()
      const chapterChanged = oldHref !== this.latest?.start.href
      const contents = this.rendition!.getContents() as unknown as Contents[]
      await Promise.all(contents.map((content) => content.document.fonts?.ready))
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      // A new section may change its column width after the initial location
      // report. Place the same text again using the final font metrics.
      if (chapterChanged && this.latest?.start.cfi) await this.display(this.latest.start.cfi)
      else await this.withLocation(() => Promise.resolve())
      this.anchor = this.latest?.start.cfi
    } finally {
      this.changing = false
      if (host) host.style.visibility = visibility ?? ''
      this.emitPosition()
    }
  }
  navigate(location: Extract<ReadingLocation, { format: 'epub' }>) {
    return this.goTo(location.cfi)
  }
  goTo(href: string) {
    return this.run(() => {
      this.anchored = false
      return this.changePage(() => this.display(href))
    })
  }
  seek(percentage: number) {
    if (!this.indexed) return Promise.resolve()
    return this.goTo(this.book.locations.cfiFromPercentage(Math.min(1, Math.max(0, percentage))))
  }
  next() {
    return this.run(async () => {
      if (!this.latest?.atEnd) {
        this.anchored = false
        await this.changePage(() => this.withLocation(() => this.rendition!.next()))
      }
    })
  }
  previous() {
    return this.run(async () => {
      if (!this.latest?.atStart) {
        this.anchored = false
        await this.changePage(() => this.withLocation(() => this.rendition!.prev()))
      }
    })
  }

  destroy() {
    this.disposed = true
    this.observer?.disconnect()
    // epub.js cannot be destroyed while its async render/index task still uses the book.
    void Promise.allSettled([this.opening, this.indexing, this.action]).then(() =>
      this.book.destroy(),
    )
  }
}
