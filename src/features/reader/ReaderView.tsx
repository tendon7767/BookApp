import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, List, X } from 'lucide-react'
import type { BookMetadata } from '../../domain/book'
import { TocDialog } from './TocDialog'
import { ReaderGestures } from './ReaderGestures'
import { TypographyPanel } from './TypographyPanel'
import { readingColors, type ReadingSettings } from './readingSettings'
import type { TocEntry } from './TocDialog'

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
  const [closing, setClosing] = useState(false)
  const [exitError, setExitError] = useState(false)
  const [slider, setSlider] = useState<number | null>(null)
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(seekTimer.current), [])
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
          void reader.act(event.key === 'ArrowRight' ? 'next' : 'previous')
        }
        if (event.key === 'Escape') reader.setControls(!reader.controls)
      }}
    >
      {children}
      {reader.ready && <ReaderGestures onGesture={(gesture) => void reader.act(gesture)} />}
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
              onClick={() => void reader.act('previous')}
              disabled={reader.busy || reader.position?.atStart}
            >
              <ChevronLeft size={20} />
              上一頁
            </button>
            <button onClick={() => setTocOpen(true)}>
              <List size={20} />
              目錄
            </button>
            <button aria-label="閱讀排版" onClick={() => setTypographyOpen(true)}>
              <span className="aa-label">Aa</span>
            </button>
            <button
              onClick={() => void reader.act('next')}
              disabled={reader.busy || reader.position?.atEnd}
            >
              下一頁
              <ChevronRight size={20} />
            </button>
          </div>
          {extraControls}
          <p className="reader-hint">左右點按或滑動翻頁 · 點中央開關選單</p>
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
      {typographyOpen && (
        <TypographyPanel
          settings={reader.readingSettings}
          onChange={reader.updateSettings}
          onClose={() => setTypographyOpen(false)}
          savingError={reader.settingsError}
        />
      )}
    </section>
  )
}
