import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookEdits, LibraryBook } from '../../domain/book'
import {
  deleteLocalBook,
  deleteLocalBooks,
  categorizeBooks,
  listLibraryBooks,
  updateBookMetadata,
} from '../../storage/bookRepository'
import { assignSeries } from '../../storage/seriesRepository'
import type { SeriesAssignment } from '../../domain/series'
import { importBook } from '../import/importBook'
import { defaultLibraryFilter } from './libraryView'
import type { SeriesSort } from './seriesView'
import { readPreferences, writeShelfSort } from '../../storage/database'

export interface ImportNotice {
  name: string
  message: string
  failed: boolean
  added: boolean
}

export function useLibrary() {
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [activeSeries, setActiveSeries] = useState<string | null>(null)
  const [filter, setFilterState] = useState(defaultLibraryFilter)
  const [seriesSort, setSeriesSortState] = useState<SeriesSort>('volume')
  const revision = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(
    null,
  )
  const [notices, setNotices] = useState<ImportNotice[]>([])
  const importing = useRef(false)
  const reload = useCallback(async () => {
    const request = ++revision.current
    try {
      const loaded = await listLibraryBooks()
      if (request !== revision.current) return
      setBooks(loaded)
      setError(null)
    } catch {
      if (request === revision.current) setError('無法讀取本機書庫，請關閉其他「看書」視窗後重試。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Synchronize with the async IndexedDB source; reload awaits its result before updating state.
    void reload()
    const onFocus = () => {
      if (!importing.current) void reload()
    }
    window.addEventListener('focus', onFocus)
    const applyPreferences = () =>
      readPreferences()
        .then((p) => {
          setFilterState((current) => ({ ...current, sort: p.librarySort ?? 'recent' }))
          setSeriesSortState(p.seriesSort ?? 'volume')
        })
        .catch(() => undefined)
    const restore = () => {
      void reload()
      void applyPreferences()
    }
    void applyPreferences()
    window.addEventListener('kanshu-restored', restore)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('kanshu-restored', restore)
    }
  }, [reload])
  function setFilter(value: typeof filter) {
    setFilterState(value)
    if (value.sort !== filter.sort) void persistSort({ librarySort: value.sort })
  }
  function setSeriesSort(value: SeriesSort) {
    setSeriesSortState(value)
    void persistSort({ seriesSort: value })
  }
  function persistSort(patch: Parameters<typeof writeShelfSort>[0]) {
    return writeShelfSort(patch)
      .then(() => window.dispatchEvent(new Event('kanshu-restored')))
      .catch(() => setError('無法保存排序設定。'))
  }

  async function importFiles(files: File[]) {
    if (importing.current || !files.length) return
    importing.current = true
    setNotices([])
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length, name: file.name })
        try {
          const result = await importBook(file)
          revision.current++
          setBooks((previous) =>
            [
              { ...result.book, progress: previous.find((b) => b.id === result.book.id)?.progress },
              ...previous.filter((book) => book.id !== result.book.id),
            ].sort((a, b) => b.createdAt - a.createdAt),
          )
          setNotices((previous) => [
            ...previous,
            {
              name: file.name,
              message: result.added
                ? ['已加入書架', ...result.warnings].join('；')
                : '書架已有相同內容，未重複加入',
              failed: false,
              added: result.added,
            },
          ])
        } catch (cause) {
          setNotices((previous) => [
            ...previous,
            {
              name: file.name,
              message: cause instanceof Error ? cause.message : '匯入失敗，請重新選擇檔案。',
              failed: true,
              added: false,
            },
          ])
        }
      }
    } finally {
      importing.current = false
      setProgress(null)
      await reload()
    }
  }

  async function removeBook(id: string) {
    await deleteLocalBook(id)
    revision.current++
    setBooks((previous) => previous.filter((book) => book.id !== id))
  }

  async function editBook(id: string, edits: BookEdits) {
    const updated = await updateBookMetadata(id, edits)
    revision.current++
    setBooks((previous) =>
      previous.map((book) => (book.id === id ? { ...book, ...updated } : book)),
    )
  }

  async function bulkCategory(ids: string[], category: string) {
    const updated = new Map((await categorizeBooks(ids, category)).map((b) => [b.id, b]))
    revision.current++
    setBooks((previous) =>
      previous.map((book) => (updated.has(book.id) ? { ...book, ...updated.get(book.id)! } : book)),
    )
  }
  async function bulkSeries(name: string, entries: SeriesAssignment[]) {
    const updated = new Map((await assignSeries(name, entries)).map((b) => [b.id, b]))
    revision.current++
    setBooks((previous) =>
      previous.map((book) => (updated.has(book.id) ? { ...book, ...updated.get(book.id)! } : book)),
    )
  }
  async function bulkRemove(ids: string[]) {
    await deleteLocalBooks(ids)
    revision.current++
    const removed = new Set(ids)
    setBooks((previous) => previous.filter((book) => !removed.has(book.id)))
  }

  return {
    books,
    activeSeries,
    setActiveSeries,
    bulkSeries,
    filter,
    setFilter,
    seriesSort,
    setSeriesSort,
    editBook,
    bulkCategory,
    bulkRemove,
    loading,
    error,
    progress,
    notices,
    reload,
    importFiles,
    removeBook,
    clearNotices: () => setNotices([]),
  }
}
export type LibraryState = ReturnType<typeof useLibrary>
