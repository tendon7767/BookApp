import { useEffect, useRef, useState } from 'react'
import type { BookMetadata, ReadingProgress, TextEncodingChoice } from '../../../domain/book'
import { getBookFile } from '../../../storage/bookRepository'
import { readProgress, saveProgress } from '../../../storage/progressRepository'
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
import type { TocEntry } from '../TocDialog'
import { TextEngine, type TextPosition } from './TextEngine'
import { encodingChoice, type TextDocument } from './textDocument'

export function useTextReader(book: BookMetadata) {
  const host = useRef<HTMLDivElement>(null)
  const customized = useRef(false)
  const engine = useRef<TextEngine | null>(null)
  const mounted = useRef(false)
  const locked = useRef(false)
  const writes = useRef<Promise<void>>(Promise.resolve())
  const actions = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef<ReadingProgress | null>(null)
  const desired = useRef<ReadingSettings | null>(null)
  const pending = useRef<ReadingSettings | null>(null)
  const [ready, setReady] = useState(false)
  const [controls, setControls] = useState(false)
  const [busy, setBusy] = useState(false)
  const [position, setPosition] = useState<TextPosition | null>(null)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [settingsError, setSettingsError] = useState(false)
  const [readingSettings, setReadingSettings] = useState(defaultReadingSettings)
  const [encoding, setEncoding] = useState<TextDocument['encoding']>('utf-8')
  const [choice, setChoice] = useState<TextEncodingChoice>('auto')

  function persist(task: () => Promise<void>, setting = false) {
    writes.current = writes.current.catch(() => undefined).then(task)
    void writes.current.then(
      () => {
        if (mounted.current) (setting ? setSettingsError : setSaveError)(false)
      },
      () => {
        if (mounted.current) (setting ? setSettingsError : setSaveError)(true)
      },
    )
  }
  useEffect(() => {
    let cancelled = false
    mounted.current = true
    let reader: TextEngine | undefined
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const save = () => {
      if (latest.current) {
        const value = latest.current
        persist(() => saveProgress(value))
      }
    }
    document.addEventListener('visibilitychange', save)
    window.addEventListener('pagehide', save)
    void (async () => {
      try {
        const [file, saved, settings] = await Promise.all([
          getBookFile(book.id),
          readProgress(book.id),
          readPreferences().then((p) => readReadingSettings(book.id, p.theme)),
        ])
        if (cancelled) return
        if (!file || !host.current) throw new Error('找不到本機書檔，請返回書架重新匯入。')
        latest.current = saved ?? null
        desired.current = settings
        setReadingSettings(settings)
        let lastDocument: TextDocument | undefined
        reader = new TextEngine(settings, (value, location, document) => {
          if (cancelled) return
          setPosition(value)
          setEncoding(document.encoding)
          setChoice(encodingChoice(location.encodingChoice))
          if (lastDocument !== document) {
            lastDocument = document
            setToc(document.toc)
            setNotice(
              !document.text.trim()
                ? '這個 TXT 沒有可閱讀的文字。'
                : document.replacements
                  ? '部分文字無法解碼，可在閱讀選單切換 TXT 編碼。'
                  : null,
            )
          }
          const progress: ReadingProgress = {
            bookId: book.id,
            location,
            percentage: value.percentage,
            updatedAt: Math.max(Date.now(), (latest.current?.updatedAt ?? 0) + 1),
          }
          latest.current = progress
          persist(() => saveProgress(progress))
        })
        engine.current = reader
        await reader.open(
          file,
          host.current,
          saved?.location.format === 'txt' ? saved.location : undefined,
        )
        if (!cancelled) setReady(true)
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '無法開啟 TXT')
          setControls(true)
        }
      }
    })()
    return () => {
      cancelled = true
      mounted.current = false
      pending.current = null
      document.body.style.overflow = overflow
      document.removeEventListener('visibilitychange', save)
      window.removeEventListener('pagehide', save)
      reader?.destroy()
      engine.current = null
    }
    // Books mount by ID; event callbacks and persistence use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  function command(action: (reader: TextEngine) => Promise<void>) {
    if (!engine.current || locked.current) return Promise.resolve()
    locked.current = true
    setBusy(true)
    actions.current = (async () => {
      try {
        await action(engine.current!)
        do {
          while (pending.current && engine.current) {
            const next = pending.current
            pending.current = null
            await engine.current.applySettings(next)
          }
          await writes.current.catch(() => undefined)
        } while (pending.current && engine.current)
      } catch (cause) {
        if (mounted.current)
          setNotice(cause instanceof Error ? cause.message : '未能完成操作，請再試一次。')
      } finally {
        locked.current = false
        if (mounted.current) setBusy(false)
      }
    })()
    return actions.current
  }
  function updateSettings(value: ReadingSettings) {
    if (!ready) return
    customized.current = true
    const settings = parseReadingSettings(value)
    desired.current = settings
    pending.current = settings
    setReadingSettings(settings)
    persist(() => writeReadingSettings(book.id, settings), true)
    void command(async () => undefined)
  }
  return {
    host,
    ready,
    controls,
    setControls,
    busy,
    position,
    toc,
    error,
    notice,
    setNotice,
    saveError,
    settingsError,
    readingSettings,
    updateSettings,
    encoding,
    choice,
    changeEncoding: (value: TextEncodingChoice) => command((r) => r.changeEncoding(value)),
    act: (gesture: 'next' | 'previous' | 'toggle') => {
      if (gesture === 'toggle') {
        setControls((value) => !value)
        return
      }
      return command((r) => (gesture === 'next' ? r.next() : r.previous()))
    },
    seek: (ratio: number) => command((r) => r.seek(ratio)),
    jump: (href: string) =>
      command((r) => r.navigate({ format: 'txt', characterOffset: Number(href) })),
    flush: async () => {
      await actions.current
      await writes.current.catch(() => undefined)
      if (latest.current) await saveProgress(latest.current)
      if (customized.current && desired.current)
        await writeReadingSettings(book.id, desired.current)
    },
  }
}
