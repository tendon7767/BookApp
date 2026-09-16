import { useEffect, useRef, useState } from 'react'
import type { NavItem } from 'epubjs'
import type { BookMetadata, ReadingLocation, ReadingProgress } from '../../../domain/book'
import { getBookFile } from '../../../storage/bookRepository'
import {
  readEpubLocations,
  readProgress,
  saveEpubLocations,
  saveProgress,
} from '../../../storage/progressRepository'
import { EpubEngine, type EpubPosition, type Gesture } from './EpubEngine'
import { readPreferences } from '../../../storage/database'
import {
  readReadingSettings,
  writeReadingSettings,
} from '../../../storage/readingSettingsRepository'
import {
  defaultReadingSettings,
  parseReadingSettings,
  type ReadingSettings,
} from '../readingSettings'

export function useEpubReader(book: BookMetadata) {
  const host = useRef<HTMLDivElement>(null)
  const customized = useRef(false)
  const engine = useRef<EpubEngine | null>(null)
  const [ready, setReady] = useState(false)
  const [controls, setControls] = useState(false)
  const [position, setPosition] = useState<EpubPosition | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const latest = useRef<ReadingProgress | null>(null)
  const writes = useRef<Promise<void>>(Promise.resolve())
  const [busy, setBusy] = useState(false)
  const navigating = useRef(false)
  const [readingSettings, setReadingSettings] = useState(defaultReadingSettings)
  const [settingsError, setSettingsError] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const desiredSettings = useRef<ReadingSettings | null>(null)
  const pendingSettings = useRef<ReadingSettings | null>(null)
  const applying = useRef(false)
  const layoutTask = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(false)

  useEffect(() => {
    let cancelled = false
    mounted.current = true
    let reader: EpubEngine | undefined
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function persist(progress: ReadingProgress) {
      writes.current = writes.current.catch(() => undefined).then(() => saveProgress(progress))
      void writes.current.then(
        () => {
          if (!cancelled) setSaveError(false)
        },
        () => {
          if (!cancelled) setSaveError(true)
        },
      )
    }
    const onHide = () => {
      if (latest.current) persist(latest.current)
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    const reportWarning = (message: string) => {
      if (!cancelled) setNotice(message)
    }
    async function open() {
      try {
        const [file, saved, cache, storedSettings] = await Promise.all([
          getBookFile(book.id),
          readProgress(book.id),
          readEpubLocations(book.id, book.fileHash),
          readPreferences().then((preferences) => readReadingSettings(book.id, preferences.theme)),
        ])
        if (cancelled) return
        if (!file || !host.current) throw new Error('找不到本機書檔，請返回書架重新匯入。')
        latest.current = saved ?? null
        desiredSettings.current = storedSettings
        setReadingSettings(storedSettings)
        reader = new EpubEngine(
          {
            warning: reportWarning,
            position: (value) => {
              if (cancelled) return
              setPosition(value)
              const progress: ReadingProgress = {
                bookId: book.id,
                location: { format: 'epub', cfi: value.cfi },
                percentage: value.percentage ?? latest.current?.percentage ?? 0,
                updatedAt: Math.max(Date.now(), (latest.current?.updatedAt ?? 0) + 1),
              }
              latest.current = progress
              persist(progress)
            },
          },
          storedSettings,
        )
        engine.current = reader
        await reader.open(
          file,
          host.current,
          saved?.location.format === 'epub' ? saved.location : undefined,
        )
        if (cancelled) return
        setReady(true)
        void reader.toc().then(
          (items) => {
            if (!cancelled) setToc(items)
          },
          () => reportWarning('目錄無法載入，仍可逐頁閱讀。'),
        )
        void reader
          .prepareLocations(cache, (locations) =>
            saveEpubLocations(book.id, book.fileHash, locations),
          )
          .catch(() => reportWarning('進度索引未能完成，仍可翻頁與保存位置。'))
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '無法開啟 EPUB')
          setControls(true)
        }
      }
    }
    void open()
    return () => {
      cancelled = true
      mounted.current = false
      pendingSettings.current = null
      document.body.style.overflow = overflow
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      reader?.destroy()
      engine.current = null
    }
    // The selected book is mounted with its ID as key; commands use refs, not render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.fileHash])

  async function command(action: (reader: EpubEngine) => Promise<void>) {
    if (!engine.current || navigating.current || applying.current) return
    navigating.current = true
    setBusy(true)
    try {
      await action(engine.current)
      // Keep close/navigation state busy until this relocation's queued write settles.
      // Storage errors already have their own persistent, actionable message.
      await writes.current.catch(() => undefined)
    } catch {
      setNotice('未能跳轉到這個位置，請再試一次或從目錄選擇其他章節。')
      setControls(true)
    } finally {
      navigating.current = false
      setBusy(false)
    }
  }
  function act(gesture: Gesture) {
    if (gesture === 'toggle') {
      setControls((value) => !value)
      return
    }
    return command((reader) => (gesture === 'next' ? reader.next() : reader.previous()))
  }
  async function flush() {
    await layoutTask.current
    await writes.current.catch(() => undefined)
    if (latest.current) await saveProgress(latest.current)
    if (customized.current && desiredSettings.current)
      await writeReadingSettings(book.id, desiredSettings.current)
  }
  function updateSettings(value: ReadingSettings) {
    if (!engine.current || !ready) return
    customized.current = true
    const settings = parseReadingSettings(value)
    desiredSettings.current = settings
    pendingSettings.current = settings
    setReadingSettings(settings)
    writes.current = writes.current
      .catch(() => undefined)
      .then(() => writeReadingSettings(book.id, settings))
    void writes.current.then(
      () => {
        if (mounted.current) setSettingsError(false)
      },
      () => {
        if (mounted.current) setSettingsError(true)
      },
    )
    if (applying.current) return
    applying.current = true
    setFormatting(true)
    layoutTask.current = (async () => {
      try {
        while (pendingSettings.current && engine.current) {
          const next = pendingSettings.current
          pendingSettings.current = null
          await engine.current.applySettings(next)
        }
      } catch {
        if (mounted.current) setNotice('排版未能完整套用，請重試或返回書架重新開書。')
      } finally {
        applying.current = false
        if (mounted.current) setFormatting(false)
      }
    })()
  }
  return {
    host,
    ready,
    controls,
    setControls,
    position,
    toc,
    error,
    notice,
    setNotice,
    saveError,
    busy: busy || formatting,
    readingSettings,
    settingsError,
    updateSettings,
    location: position ? ({ format: 'epub', cfi: position.cfi } as const) : null,
    act,
    flush,
    jump: (href: string) => command((reader) => reader.goTo(href)),
    navigate: (location: ReadingLocation) =>
      location.format === 'epub'
        ? command((reader) => reader.navigate(location))
        : Promise.resolve(),
    search: (query: string) => engine.current?.search(query) ?? Promise.resolve([]),
    seek: (percentage: number) => command((reader) => reader.seek(percentage)),
  }
}
