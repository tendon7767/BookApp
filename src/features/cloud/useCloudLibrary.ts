import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { readCloudPreferences, writeCloudPreferences } from '../../storage/cloudRepository'
import { captureLocal } from '../../storage/syncRepository'
import { DriveError } from './driveClient'
import { SyncDrive, type RemoteEntry } from './syncDrive'
import { authorizeDrive, loadGoogleSdk, pickDriveFolder } from './googleSdk'
import {
  environmentConfig,
  parseDriveConfig,
  type CloudPreferences,
  type DriveConfig,
} from './types'
import { conflicts, equal, materialize, type Json, type SyncState } from './syncModel'
import {
  downloadBook,
  fingerprint,
  loadSnapshot,
  resolveConflict,
  restoreSnapshot,
  synchronize,
  targetKey,
  withSyncLock,
} from './syncEngine'
import type { BookMetadata } from '../../domain/book'

export function useCloudLibrary(
  active: boolean,
  online: boolean,
  reloadLibrary: () => Promise<void>,
) {
  const [preferences, setPreferences] = useState<CloudPreferences>({})
  const [ready, setReady] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkAttempt, setSdkAttempt] = useState(0)
  const [sdkError, setSdkError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [state, setState] = useState<SyncState>()
  const [history, setHistory] = useState<RemoteEntry[]>([])
  const [expiresAt, setExpiresAt] = useState(0)
  const session = useRef<{ token: string; expiresAt: number } | null>(null)
  const operation = useRef<AbortController | null>(null)
  const nextAttempt = useRef(0)
  const retryDelay = useRef(15000)
  const config = preferences.config ?? environmentConfig()
  const target =
    preferences.target?.accountId === preferences.account?.id ? preferences.target : undefined
  function client() {
    return new SyncDrive(() => {
      if (!session.current || session.current.expiresAt <= Date.now()) throw new DriveError(401)
      return session.current.token
    })
  }
  useEffect(() => {
    let mounted = true
    void readCloudPreferences()
      .then((saved) => {
        if (mounted) {
          setPreferences(saved)
          setReady(true)
        }
      })
      .catch(() => {
        if (mounted) setError('無法讀取雲端設定，請重新開啟。')
      })
    return () => {
      mounted = false
      operation.current?.abort()
      session.current = null
    }
  }, [])
  const configured = !!config
  useEffect(() => {
    if (!active || !online || !configured) return
    let mounted = true
    void loadGoogleSdk()
      .then(() => {
        if (mounted) {
          setSdkReady(true)
          setSdkError('')
        }
      })
      .catch((cause: unknown) => {
        if (mounted) setSdkError(cause instanceof Error ? cause.message : 'Google 元件載入失敗。')
      })
    return () => {
      mounted = false
    }
  }, [active, online, configured, sdkAttempt])
  useEffect(() => {
    if (!expiresAt) return
    const timer = setTimeout(
      () => {
        session.current = null
        setExpiresAt(0)
      },
      Math.max(0, expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [expiresAt])

  async function run(label: string, task: (signal: AbortSignal) => Promise<void>, network = true) {
    if (operation.current || !ready) return false
    if (network && !navigator.onLine) {
      setError('目前離線，變更已保留在本機，連線後再同步。')
      return false
    }
    const controller = new AbortController()
    operation.current = controller
    setBusy(label)
    setError('')
    setNotice('')
    // Bulk uploads can take time on mobile; cancellation remains available.
    const timer = setTimeout(() => controller.abort(), 30 * 60 * 1000)
    try {
      await task(controller.signal)
      retryDelay.current = 15000
      return true
    } catch (cause) {
      if (cause instanceof DriveError && cause.status === 401) {
        session.current = null
        setExpiresAt(0)
      }
      setError(
        controller.signal.aborted
          ? '同步已停止。已保存的資料會保留，可稍後重試。'
          : cause instanceof TypeError
            ? '無法連上 Google，變更仍保留在本機，稍後會重試。'
            : cause instanceof Error
              ? cause.message
              : '操作失敗，請重試。',
      )
      nextAttempt.current = Date.now() + retryDelay.current
      retryDelay.current = Math.min(300000, retryDelay.current * 2)
      return false
    } finally {
      clearTimeout(timer)
      operation.current = null
      setBusy('')
    }
  }
  function connect() {
    if (!config || !sdkReady) return
    return run('正在連接 Google…', async (signal) => {
      session.current = null
      setExpiresAt(0)
      const authorization = await authorizeDrive(config, signal)
      session.current = authorization
      try {
        const account = await client().account(signal)
        signal.throwIfAborted()
        const next = { ...preferences, account }
        await writeCloudPreferences(next)
        setPreferences(next)
        setState(undefined)
        setHistory([])
        setExpiresAt(authorization.expiresAt)
        nextAttempt.current = 0
        setNotice(
          next.target?.accountId === account.id
            ? '已連接，將自動同步既有備份位置。'
            : '已連接。請選擇備份位置；本機書架會與該位置合併。',
        )
      } catch (cause) {
        session.current = null
        throw cause
      }
    })
  }
  function disconnect() {
    if (operation.current) return
    session.current = null
    setExpiresAt(0)
    setError('')
    setNotice('已中斷連接。本機書籍與待同步變更仍保留。')
  }
  async function saveConfig(value: DriveConfig) {
    if (operation.current || !ready) throw new Error('請等待目前操作完成。')
    const next = { ...preferences, config: parseDriveConfig(value) }
    operation.current = new AbortController()
    setBusy('正在保存連接設定…')
    try {
      await writeCloudPreferences(next)
      session.current = null
      setExpiresAt(0)
      setPreferences(next)
      setSdkError('')
      setSdkAttempt((n) => n + 1)
    } finally {
      operation.current = null
      setBusy('')
    }
  }
  function choose() {
    if (!config || !preferences.account || !session.current) return
    const accountId = preferences.account.id
    return run('正在選擇備份位置…', async (signal) => {
      const picked = await pickDriveFolder(config, session.current!.token, signal)
      if (!picked[0]) return
      const result = await withSyncLock(async () => {
        const folder = await client().folder(picked[0].id, signal)
        const next = { ...preferences, target: { accountId, id: folder.id, name: folder.name } }
        await writeCloudPreferences(next)
        setPreferences(next)
        setState(undefined)
        setHistory([])
        nextAttempt.current = 0
        setNotice('備份位置已設定，將合併此處的書架並自動備份。')
        return true
      })
      if (!result) throw new Error('另一個「看書」視窗正在同步，請稍後重試。')
    })
  }
  function sync() {
    if (!target) return
    return run('正在同步…', async (signal) => {
      const result = await withSyncLock(() => synchronize(client(), target, signal, setBusy))
      if (!result) throw new Error('另一個「看書」視窗正在同步，請稍後重試。')
      setState(result.state)
      setHistory(
        result.entries
          .filter((entry) => entry.appProperties?.kanshu === 'snapshot-v1')
          .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''))
          .slice(0, 20),
      )
      nextAttempt.current = result.again ? 0 : Date.now() + 60000
      await reloadLibrary()
      window.dispatchEvent(new Event('kanshu-restored'))
      setNotice(
        conflicts(result.state.document).length
          ? '資料已保存，有同時修改的項目需要選擇。'
          : result.again
            ? '新變更已排入下一次同步。'
            : '書架、原檔與設定已同步。',
      )
    })
  }
  const automatic = useEffectEvent(async () => {
    if (!ready || !target || operation.current || document.visibilityState === 'hidden') return
    try {
      const captured = await withSyncLock(() => captureLocal(targetKey(target)))
      if (!captured) return
      setState(captured)
      if (fingerprint(captured) !== captured.published && retryDelay.current === 15000) {
        const previous = captured.published
          ? materialize(JSON.parse(captured.published).document)
          : {}
        const current = materialize(captured.document)
        const metadataChanged = Object.entries(current).some(
          ([key, value]) => !key.endsWith('/progress') && !equal(previous[key], value),
        )
        // Reading checkpoints are batched; do not create a whole-library snapshot on every page turn.
        nextAttempt.current = metadataChanged
          ? 0
          : Math.min(nextAttempt.current, (captured.lastSync ?? 0) + 30000)
      }
      if (online && session.current && Date.now() >= nextAttempt.current) await sync()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法保存待同步資料。')
    }
  })
  useEffect(() => {
    const tick = () => {
      void automatic()
    }
    const timer = setInterval(tick, 5000)
    const wake = () => {
      nextAttempt.current = 0
      tick()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])
  function resolve(field: string, value: Json) {
    if (!target) return
    return run(
      '正在保存選擇…',
      async () => {
        const result = await withSyncLock(() => resolveConflict(target, field, value))
        if (!result) throw new Error('另一個視窗正在同步，請稍後重試。')
        setState(result)
        nextAttempt.current = 0
        await reloadLibrary()
        window.dispatchEvent(new Event('kanshu-restored'))
      },
      false,
    )
  }
  function restore(entry: RemoteEntry) {
    if (!target) return
    return run('正在還原備份…', async (signal) => {
      const snapshot = await loadSnapshot(client(), entry, signal)
      const result = await withSyncLock(() => restoreSnapshot(target, snapshot))
      if (!result) throw new Error('另一個視窗正在同步，請稍後重試。')
      setState(result)
      nextAttempt.current = 0
      await reloadLibrary()
      window.dispatchEvent(new Event('kanshu-restored'))
      setNotice('已還原此版本的書籍與設定；此版本以後加入的書籍仍保留。還原結果將再同步。')
    })
  }
  async function ensureDownloaded(book: BookMetadata) {
    if (book.downloaded !== false) return true
    if (!preferences.account || !session.current) {
      setError('請先連接 Google Drive，再下載這本書。')
      return false
    }
    return run('正在下載…', async (signal) => {
      await downloadBook(client(), book, preferences.account!.id, signal, setBusy)
      await reloadLibrary()
    })
  }
  async function downloadBooks(books: BookMetadata[]) {
    const pending = books.filter((book) => book.downloaded === false)
    if (!pending.length) return true
    if (!preferences.account || !session.current) {
      setError('請先連接 Google Drive，再下載書籍。')
      return false
    }
    return run('正在下載書籍…', async (signal) => {
      try {
        for (const [index, book] of pending.entries()) {
          await downloadBook(client(), book, preferences.account!.id, signal, (message) =>
            setBusy(`${index + 1}/${pending.length} · ${message}`),
          )
        }
      } finally {
        await reloadLibrary()
      }
    })
  }
  const publishedFields = state?.published
    ? (JSON.parse(state.published) as { document: SyncState['document'] }).document.fields
    : {}
  const pendingCount = state
    ? new Set(
        Object.entries(state.document.fields)
          .filter(([key, versions]) => !equal(versions, publishedFields[key]))
          .map(([key]) => key.split('/')[0]),
      ).size
    : 0
  const values = state ? materialize(state.document) : {}
  return {
    ready,
    config,
    account: preferences.account,
    target,
    state,
    history,
    pendingCount,
    values,
    conflicts: state ? conflicts(state.document) : [],
    connected: !!expiresAt,
    sdkReady,
    sdkError,
    error,
    notice,
    busy,
    cancellable: !!busy,
    connect,
    disconnect,
    saveConfig,
    choose,
    sync,
    resolve,
    restore,
    ensureDownloaded,
    downloadBooks,
    cancel: () => operation.current?.abort(),
    retrySdk: () => setSdkAttempt((n) => n + 1),
  }
}
export type CloudLibraryState = ReturnType<typeof useCloudLibrary>
