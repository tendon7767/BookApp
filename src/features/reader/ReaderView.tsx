import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  History,
  List,
  Search,
  X,
} from 'lucide-react'
import type { BookMetadata, ReadingLocation } from '../../domain/book'
import { emptyReadingMarks, type ReadingMarks } from '../../domain/readingMarks'
import {
  addBookmark,
  popReadingTrail,
  pushReadingTrail,
  readReadingMarks,
  removeBookmark,
} from '../../storage/readingMarksRepository'
import { TocDialog } from './TocDialog'
import { ReaderGestures } from './ReaderGestures'
import { TapZoneHint } from './TapZoneHint'
import { TypographyPanel } from './TypographyPanel'
import { readingColors, type ReadingSettings } from './readingSettings'
import type { TocEntry } from './TocDialog'
import { ReaderToolsDialog } from './ReaderToolsDialog'
import type { ReaderSearchResult } from './search'

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
  location: ReadingLocation | null
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
  const [marks, setMarks] = useState<ReadingMarks>(emptyReadingMarks)
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
  const [flip, setFlip] = useState<{ gesture: 'next' | 'previous'; count: number } | null>(null)
  const page = useRef<HTMLDivElement>(null)
  const turning = useRef(false)
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setReaderNotice = reader.setNotice
  useEffect(() => () => clearTimeout(seekTimer.current), [])
  useEffect(() => {
    let active = true
    void readReadingMarks(book.id)
      .then((value) => {
        if (active) setMarks(value)
      })
      .catch(() => setReaderNotice('書籤暫時無法讀取，請返回書架後重試。'))
    return () => {
      active = false
    }
  }, [book.id, setReaderNotice])
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
  // The turn animation plays on the page that just arrived, so it waits for the engine.
  function act(gesture: 'next' | 'previous' | 'toggle') {
    const result = reader.act(gesture)
    if (gesture === 'toggle' || reader.readingSettings.pageAnimation === 'none')
      return void Promise.resolve(result)
    void Promise.resolve(result).then(() =>
      setFlip((previous) => ({ gesture, count: (previous?.count ?? 0) + 1 })),
    )
  }
  const sliding = reader.readingSettings.pageAnimation !== 'none'
  function shift(offset: number, duration = 0) {
    const element = page.current
    if (!element) return
    element.style.transition = duration ? `transform ${duration}ms ease-out` : 'none'
    element.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : ''
  }
  // The page follows the finger; an edge resists instead of opening a gap.
  function dragMove(dx: number) {
    if (turning.current) return
    // A running turn animation would otherwise outrank the inline transform.
    if (flip) setFlip(null)
    const blocked = dx > 0 ? reader.position?.atStart : reader.position?.atEnd
    shift(blocked ? dx / 4 : dx)
  }
  function dragEnd(dx: number, width: number) {
    if (turning.current) return
    const gesture = dx < 0 ? 'next' : 'previous'
    const blocked = dx > 0 ? reader.position?.atStart : reader.position?.atEnd
    if (blocked || reader.busy || Math.abs(dx) < Math.max(56, width * 0.2)) {
      shift(0, 180)
      return
    }
    // Finish the drag off-screen first; the arriving page then slides in from the other side.
    turning.current = true
    shift(dx < 0 ? -width : width, 130)
    setTimeout(() => {
      void Promise.resolve(reader.act(gesture)).finally(() => {
        shift(0)
        turning.current = false
        setFlip((previous) => ({ gesture, count: (previous?.count ?? 0) + 1 }))
      })
    }, 130)
  }
  const flipOffset = flip?.gesture === 'previous' ? '-24px' : '24px'
  const percentage = reader.position?.percentage
  const label = percentage == null ? '計算進度中…' : `${Math.round(percentage * 100)}%`
  const colors = readingColors(reader.readingSettings)
  async function close() {
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
      setExitError(true)
      setClosing(false)
    }
  }
  async function remember(label: string) {
    if (!reader.location) return
    try {
      setMarks(
        await pushReadingTrail(book.id, {
          location: reader.location,
          percentage: reader.position?.percentage ?? 0,
          label,
        }),
      )
    } catch {
      reader.setNotice('未能保存跳轉前位置，仍會繼續開啟目標內容。')
    }
  }
  function seek(value: number) {
    setSlider(value)
    clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => {
      void remember(`跳轉前 · ${label}`)
        .then(() => reader.seek(value / 100))
        .finally(() => setSlider(null))
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
      <div
        ref={page}
        className={`reader-page${flip ? ` reader-flip-${flip.count % 2 ? 'a' : 'b'}` : ''}`}
        style={
          {
            '--flip-dx': zones === 'vertical' ? '0px' : flipOffset,
            '--flip-dy': zones === 'vertical' ? flipOffset : '0px',
          } as CSSProperties
        }
      >
        {children}
      </div>
      {reader.ready && (
        <ReaderGestures
          tapZones={zones}
          onGesture={act}
          onDragMove={sliding ? dragMove : undefined}
          onDragEnd={sliding ? dragEnd : undefined}
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
          <button
            className="icon-button"
            aria-label="返回書架"
            onClick={() => void close()}
            disabled={closing || reader.busy}
          >
            <ArrowLeft size={22} />
          </button>
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
      {reader.controls && reader.ready && (
        <footer className="reader-controls" aria-label="閱讀控制">
          <div className="reader-slider">
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
          </div>
          <div className="reader-actions">
            <button
              onClick={() => act('previous')}
              disabled={reader.busy || reader.position?.atStart}
            >
              <ChevronLeft size={20} />
              上一頁
            </button>
            <button onClick={() => setTocOpen(true)}>
              <List size={20} />
              目錄
            </button>
            <button onClick={() => setToolsOpen(true)}>
              <Search size={19} />
              搜尋
            </button>
            <button
              onClick={() => {
                if (!reader.location) return
                void addBookmark(book.id, {
                  location: reader.location,
                  percentage: reader.position?.percentage ?? 0,
                  label: reader.position?.href || `${label} 的位置`,
                })
                  .then(setMarks)
                  .catch(() => reader.setNotice('書籤未能保存，請稍後重試。'))
              }}
            >
              <Bookmark size={19} />
              書籤
            </button>
            <button aria-label="閱讀排版" onClick={() => setTypographyOpen(true)}>
              <span className="aa-label">Aa</span>
            </button>
            <button onClick={() => act('next')} disabled={reader.busy || reader.position?.atEnd}>
              下一頁
              <ChevronRight size={20} />
            </button>
          </div>
          {marks.trail.length > 0 && (
            <button
              className="reader-return-button"
              onClick={() => {
                void popReadingTrail(book.id).then(({ marks: next, popped }) => {
                  setMarks(next)
                  if (popped) void reader.navigate(popped.location)
                })
              }}
            >
              <History size={18} /> 返回跳轉前位置
            </button>
          )}
          {extraControls}
          <button className="reader-hint" aria-label="顯示點按區域" onClick={() => setHint(true)}>
            {zones === 'vertical' ? '上下點按' : '左右點按'} · 左右滑動翻頁 · 點中央開關選單
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
            void remember(`目錄跳轉前 · ${label}`).then(() => reader.jump(href))
          }}
        />
      )}
      {toolsOpen && (
        <ReaderToolsDialog
          marks={marks}
          onClose={() => setToolsOpen(false)}
          onSearch={reader.search}
          onSelect={(result) => {
            setToolsOpen(false)
            void remember(`跳轉前 · ${label}`).then(() => reader.navigate(result.location))
          }}
          onRemoveBookmark={(id) => void removeBookmark(book.id, id).then(setMarks)}
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
