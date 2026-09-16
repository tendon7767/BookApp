import { lazy, Suspense, useState } from 'react'
import type { BookMetadata } from './domain/book'
import { ArrowLeft, BookOpen, Check, Download, LibraryBig, Settings2, WifiOff } from 'lucide-react'
import { InstallDialog } from './components/InstallDialog'
import { LibraryScreen } from './features/library/LibraryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { usePreferences } from './features/settings/usePreferences'
import { usePwaStatus } from './platform/usePwaStatus'
import { useLibrary } from './features/library/useLibrary'
import { useCloudLibrary } from './features/cloud/useCloudLibrary'
import { CloudLibraryScreen } from './features/cloud/CloudLibraryScreen'

const TextReader = lazy(() => import('./features/reader/text/TextReader'))
const EpubReader = lazy(() => import('./features/reader/epub/EpubReader'))

export default function App() {
  const [screen, setScreen] = useState<'library' | 'settings' | 'cloud'>('library')
  const [installOpen, setInstallOpen] = useState(false)
  const [reading, setReading] = useState<BookMetadata | null>(null)
  const settings = usePreferences()
  const status = usePwaStatus()
  const library = useLibrary()
  const cloud = useCloudLibrary(screen === 'cloud', status.online, library.reload)
  function navigate(next: typeof screen) {
    setScreen(next)
    window.scrollTo({ top: 0 })
  }
  async function openBook(book: BookMetadata) {
    if (book.downloaded === false) {
      navigate('cloud')
      if (!(await cloud.ensureDownloaded(book))) return
    }
    navigate('library')
    setReading(book)
  }

  const ActiveReader = reading?.format === 'txt' ? TextReader : EpubReader
  if (reading)
    return (
      <Suspense
        fallback={
          <div className="reader-loading" role="status">
            正在開啟閱讀器…
          </div>
        }
      >
        <ActiveReader
          key={reading.id}
          book={reading}
          onClose={() => {
            setReading(null)
            void library.reload()
          }}
        />
      </Suspense>
    )

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        跳至主要內容
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            navigate('library')
          }}
          aria-label="看書，返回書架"
        >
          <span className="brand-mark">
            <BookOpen size={20} strokeWidth={1.6} />
          </span>
          <span>看書</span>
        </a>
        <div className="header-actions">
          {cloud.target ? (
            <button
              className="connection-status cloud-status-button"
              aria-label="雲端同步狀態"
              onClick={() => navigate('cloud')}
            >
              <span className="status-dot" />
              <span>
                {!status.online
                  ? '離線中'
                  : cloud.busy
                    ? '同步中'
                    : !cloud.connected
                      ? '待連接'
                      : cloud.error
                        ? '同步異常'
                        : cloud.conflicts.length
                          ? '待處理'
                          : cloud.pendingCount || !cloud.state?.lastSync
                            ? '待同步'
                            : '已同步'}
              </span>
            </button>
          ) : (
            <div className="connection-status" role="status">
              {status.online ? <span className="status-dot" /> : <WifiOff size={13} />}
              <span>{status.online ? '已連線' : '離線中'}</span>
            </div>
          )}
          <button
            className="icon-button"
            aria-label={screen === 'library' ? '設定' : '書架'}
            title={screen === 'library' ? '設定' : '書架'}
            onClick={() => navigate(screen === 'library' ? 'settings' : 'library')}
          >
            {screen === 'library' ? <Settings2 size={22} /> : <LibraryBig size={22} />}
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={screen === 'library' ? 'library-main' : undefined}>
        {screen === 'library' ? (
          <LibraryScreen library={library} onRead={(book) => void openBook(book)} />
        ) : screen === 'cloud' ? (
          <CloudLibraryScreen cloud={cloud} online={status.online} />
        ) : (
          <SettingsScreen
            preferences={settings.preferences}
            disabled={!settings.ready || settings.saving}
            storageError={settings.storageError}
            status={status}
            onTheme={settings.setTheme}
            onReadingDefaults={settings.setReadingDefaults}
            onInstall={() => setInstallOpen(true)}
            onCloud={() => navigate('cloud')}
          />
        )}
        {screen === 'library' && settings.storageError && (
          <p className="inline-warning" role="alert">
            {settings.storageError}
          </p>
        )}
        {screen === 'library' && (
          <p className="offline-caption" role="status">
            {status.offlineState === 'ready' ? (
              <>
                <Check size={13} /> 可離線開啟 · 書籍需先下載
              </>
            ) : status.offlineState === 'development' ? (
              '開發預覽 · 離線功能需正式建置'
            ) : status.offlineState === 'unsupported' ? (
              '此環境不支援離線啟動，請使用 HTTPS'
            ) : status.offlineState === 'error' ? (
              '離線準備失敗，請連線後重新開啟'
            ) : (
              '正在準備離線啟動…'
            )}
          </p>
        )}
      </main>
      {screen !== 'library' && (
        <div className="settings-back-bar">
          <button className="secondary-button" onClick={() => navigate('library')}>
            <ArrowLeft size={20} aria-hidden="true" />
            返回書架
          </button>
        </div>
      )}
      {status.needRefresh && (
        <aside className="update-notice" aria-label="更新可用">
          <Download size={21} />
          <div>
            <strong>新版「看書」準備好了</strong>
            <p>現在更新會重新開啟畫面。</p>
            {status.updateError && <p role="alert">更新未完成，請連線後重試。</p>}
            <div className="update-actions">
              <button
                onClick={() => void status.applyUpdate()}
                disabled={status.updating || !!library.progress || !!cloud.busy}
              >
                {library.progress || cloud.busy
                  ? '請等待書籍操作完成'
                  : status.updating
                    ? '更新中…'
                    : '立即更新'}
              </button>
              <button onClick={status.dismissUpdate}>稍後</button>
            </div>
          </div>
        </aside>
      )}
      {installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
    </div>
  )
}
