import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, List, Search, X } from 'lucide-react'
import type { BookMetadata, ReadingLocation } from '../../domain/book'
import { TocDialog } from './TocDialog'
import { ReaderGestures } from './ReaderGestures'
import { TapZoneHint } from './TapZoneHint'
import { TypographyPanel } from './TypographyPanel'
import { readingColors, type ReadingSettings } from './readingSettings'
import type { TocEntry } from './TocDialog'
import { ReaderToolsDialog } from './ReaderToolsDialog'
import type { ReaderSearchResult } from './search'
import { appRoute } from '../../platform/appHistory'

export interface ReaderState {
  ready: boolean
  controls: boolean
  setControls: (value: boolean) => void
  position: { percentage: number | null; atStart: boolean; atEnd: boolean; href?: string } | null
  toc: TocEntry[]
  error: string | null
  notice: string | null
  setNotice: (value: string | null) => void
  saveError: boolean
  settingsError: boolean
  busy: boolean
  readingSettings: ReadingSettings
  updateSettings: (value: ReadingSettings) => void
  act: (gesture: 'next' | 'previous' | 'toggle') => void | Promise<void>
  flush: () => Promise<void>
  seek: (value: number) => Promise<void>
  jump: (href: string) => Promise<void>
  navigate: (location: ReadingLocation) => Promise<void>
  search: (query: string) => Promise<ReaderSearchResult[]>
}
export function ReaderView({
  book,
  onClose,
  reader,
  children,
  extraControls,
}: {
  book: BookMetadata
  onClose: () => void
  reader: ReaderState
  children: ReactNode
  extraControls?: ReactNode
}) {
  const [tocOpen, setTocOpen] = useState(false)
  const [typographyOpen, setTypographyOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [exitError, setExitError] = useState(false)
  const [slider, setSlider] = useState<number | null>(null)
  const [hint, setHint] = useState(() => {
    try {
      return localStorage.getItem('kanshu-zone-hint') !== null
        ? localStorage.getItem('kanshu-zone-hint') !== reader.readingSettings.tapZones
        : true
    } catch {
      return false
    }
  })
  const page = useRef<HTMLDivElement>(null)
  const turning = useRef(false)
  const animation = useRef(0)
  const exiting = useRef(false)
  const closeOnBack = useRef<(() => Promise<void>) | null>(null)
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(seekTimer.current), [])
  const zones = reader.readingSettings.tapZones
  // The hint waits for the first rendered page, then fades on its own.
  useEffect(() => {
    if (!hint || !reader.ready) return
    try {
      localStorage.setItem('kanshu-zone-hint', zones)
    } catch {
      /* private mode simply shows the hint again next time */
    }
    const timer = setTimeout(() => setHint(false), 1800)
    return () => clearTimeout(timer)
  }, [hint, reader.ready, zones])
  function updateSettings(next: ReadingSettings) {
    if (next.tapZones !== zones) setHint(true)
    reader.updateSettings(next)
  }
  // Tapping and the keyboard turn the page outright; only a swipe is animated.
  function act(gesture: 'next' | 'previous' | 'toggle') {
    void Promise.resolve(reader.act(gesture))
  }
  const sliding = reader.readingSettings.pageAnimation !== 'none'
  function shift(offset: number, duration = 0) {
    const element = page.current
    if (!element) return
    element.style.transition = duration ? `transform ${duration}ms ease-out` : 'none'
    element.style.transform = offset
      ? zones === 'vertical'
        ? `translate3d(0, ${offset}px, 0)`
        : `translate3d(${offset}px, 0, 0)`
      : ''
  }
  // The page follows the finger; an edge resists instead of opening a gap.
  function dragMove(delta: number) {
    if (turning.current) return
    animation.current++
    const blocked = delta > 0 ? reader.position?.atStart : reader.position?.atEnd
    if (page.current) page.current.style.opacity = '1'
    shift(blocked ? delta / 4 : delta)
  }
  function dragEnd(delta: number, size: number) {
    if (turning.current) return
    const gesture = delta < 0 ? 'next' : 'previous'
    const blocked = delta > 0 ? reader.position?.atStart : reader.position?.atEnd
    if (reader.busy || blocked || Math.abs(delta) < Math.max(56, size * 0.2)) {
      shift(0, 180)
      return
    }
    turning.current = true
    const animationId = ++animation.current
    const element = page.current
    if (!element) {
      turning.current = false
      return
    }
    // Finish the outgoing motion before replacing its content. Reset the
    // transform only while invisible, so there is no second position jump.
    const distance = Math.max(size, Math.abs(delta)) * (delta < 0 ? -1 : 1)
    element.style.transition = 'transform 130ms ease-out, opacity 130ms ease-out'
    element.style.transform =
      zones === 'vertical' ? `translate3d(0, ${distance}px, 0)` : `translate3d(${distance}px, 0, 0)`
    element.style.opacity = '0'
    void (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 140))
        await Promise.resolve(reader.act(gesture))
      } finally {
        element.style.transition = 'none'
        element.style.transform = ''
        element.style.opacity = '0'
        // Commit the reset before revealing the new page.
        void element.offsetWidth
        element.style.transition = 'opacity 130ms ease-out'
        element.style.opacity = '1'
        turning.current = false
        await new Promise((resolve) => setTimeout(resolve, 140))
        if (animation.current === animationId) {
          element.style.transition = ''
          element.style.opacity = ''
        }
      }
    })().catch(() => undefined)
  }
  const percentage = reader.position?.percentage
  const label = percentage == null ? '計算進度中…' : `${Math.round(percentage * 100)}%`
  const colors = readingColors(reader.readingSettings)
  async function close() {
    if (exiting.current) return
    exiting.current = true
    setClosing(true)
    try {
      clearTimeout(seekTimer.current)
      if (slider !== null) {
        await reader.seek(slider / 100)
        setSlider(null)
      }
      await reader.flush()
      onClose()
    } catch {
      exiting.current = false
      setExitError(true)
      setClosing(false)
    }
  }
  useEffect(() => {
    closeOnBack.current = close
  })
  useEffect(() => {
    const onBack = () => {
      if (appRoute()?.kind !== 'reader') void closeOnBack.current?.()
    }
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [])
  function seek(value: number) {
    setSlider(value)
    clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => {
      void reader.seek(value / 100).finally(() => setSlider(null))
    }, 200)
  }
  return (
    <section
      className="reader-screen"
      data-reader-theme={reader.readingSettings.theme}
      style={
        { '--reader-bg': colors.background, '--reader-ink': colors.foreground } as CSSProperties
      }
      aria-label={`閱讀 ${book.title}`}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement ||
          tocOpen ||
          typographyOpen
        )
          return
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault()
          act(event.key === 'ArrowRight' ? 'next' : 'previous')
        }
        if (event.key === 'Escape') reader.setControls(!reader.controls)
      }}
    >
      <div ref={page} className="reader-page">
        {children}
      </div>
      {reader.ready && (
        <ReaderGestures
          axis={zones}
          onGesture={act}
          onDragMove={sliding ? dragMove : undefined}
          onDragEnd={sliding ? dragEnd : undefined}
          onDragCancel={sliding ? () => shift(0, 180) : undefined}
        />
      )}
      {hint && reader.ready && <TapZoneHint tapZones={zones} />}
      {!reader.ready && (
        <div className="reader-loading" role={reader.error ? 'alert' : 'status'}>
          {reader.error || '正在開書…'}
        </div>
      )}
      {(reader.controls || !reader.ready) && (
        <header className="reader-toolbar">
          <h1>{book.title}</h1>
          <button
            className="icon-button"
            aria-label="隱藏閱讀選單"
            onClick={() => reader.setControls(false)}
            disabled={!reader.ready}
          >
            <X size={21} />
          </button>
        </header>
      )}
      {reader.ready && (
        <button
          className="reader-progress-toggle"
          aria-label="閱讀選單"
          aria-expanded={reader.controls}
          onClick={() => reader.setControls(!reader.controls)}
        >
          {label}
        </button>
      )}
      {(reader.controls || !reader.ready) && (
        <footer className="reader-controls" aria-label="閱讀控制">
          {reader.ready && (
            <>
              <div className="reader-slider">
                <button
                  className="reader-page-button"
                  aria-label="上一頁"
                  onClick={() => act('previous')}
                  disabled={reader.busy || reader.position?.atStart}
                >
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>
                <input
                  aria-label="閱讀進度"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  disabled={percentage == null || reader.busy}
                  value={slider ?? Math.round((percentage ?? 0) * 100)}
                  onChange={(event) => seek(Number(event.target.value))}
                />
                <output>{slider === null ? label : `${slider}%`}</output>
                <button
                  className="reader-page-button"
                  aria-label="下一頁"
                  onClick={() => act('next')}
                  disabled={reader.busy || reader.position?.atEnd}
                >
                  <ChevronRight size={22} aria-hidden="true" />
                </button>
              </div>
              <div className="reader-actions">
                <button aria-label="閱讀排版" onClick={() => setTypographyOpen(true)}>
                  <span className="aa-label">Aa</span>
                </button>
                <button onClick={() => setTocOpen(true)}>
                  <List size={20} />
                  目錄
                </button>
                <button onClick={() => setToolsOpen(true)}>
                  <Search size={19} />
                  搜尋
                </button>
              </div>
              {extraControls}
            </>
          )}
          <button
            className="secondary-button reader-back-button"
            onClick={() => void close()}
            disabled={closing || reader.busy}
          >
            <ArrowLeft size={20} aria-hidden="true" />
            返回書架
          </button>
        </footer>
      )}
      {(reader.notice || reader.saveError || reader.settingsError || exitError) && (
        <aside className="reader-notice" role="alert">
          <p>
            {exitError || reader.saveError || reader.settingsError
              ? '閱讀位置或排版設定未能保存，請勿關閉 App，可稍後再試。'
              : reader.notice}
          </p>
          {exitError ? (
            <>
              <button onClick={() => void close()}>重試保存並返回</button>
              <button onClick={onClose}>仍要返回</button>
            </>
          ) : (
            <button
              aria-label="關閉提示"
              onClick={() => reader.setNotice(null)}
              disabled={reader.saveError || reader.settingsError}
            >
              <X size={18} />
            </button>
          )}
        </aside>
      )}
      {tocOpen && (
        <TocDialog
          items={reader.toc}
          href={reader.position?.href}
          onClose={() => setTocOpen(false)}
          onSelect={(href) => {
            setTocOpen(false)
            void reader.jump(href)
          }}
        />
      )}
      {toolsOpen && (
        <ReaderToolsDialog
          onClose={() => setToolsOpen(false)}
          onSearch={reader.search}
          onSelect={(result) => {
            setToolsOpen(false)
            void reader.navigate(result.location)
          }}
        />
      )}
      {typographyOpen && (
        <TypographyPanel
          settings={reader.readingSettings}
          onChange={updateSettings}
          onClose={() => setTypographyOpen(false)}
          savingError={reader.settingsError}
        />
      )}
    </section>
  )
}
