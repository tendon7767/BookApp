import { lazy, Suspense, useEffect, useState } from 'react'
import type { BookMetadata } from './domain/book'
import { ArrowLeft, BookOpen, Cloud, CloudOff, Download, LibraryBig, Settings2 } from 'lucide-react'
import { InstallDialog } from './components/InstallDialog'
import { LibraryScreen } from './features/library/LibraryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { usePreferences } from './features/settings/usePreferences'
import { usePwaStatus } from './platform/usePwaStatus'
import { useLibrary } from './features/library/useLibrary'
import { useCloudLibrary } from './features/cloud/useCloudLibrary'
import { CloudLibraryScreen } from './features/cloud/CloudLibraryScreen'
import { StorageScreen } from './features/settings/StorageScreen'

const TextReader = lazy(() => import('./features/reader/text/TextReader'))
const EpubReader = lazy(() => import('./features/reader/epub/EpubReader'))

export default function App() {
  const [screen, setScreen] = useState<'library' | 'settings' | 'cloud' | 'storage'>('library')
  const [installOpen, setInstallOpen] = useState(false)
  const [reading, setReading] = useState<BookMetadata | null>(null)
  const settings = usePreferences()
  const status = usePwaStatus()
  const library = useLibrary()
  const cloud = useCloudLibrary(
    screen === 'cloud' || screen === 'storage',
    status.online,
    library.reload,
  )
  // The offline state is no longer shown on the shelf; expose it for diagnostics and tests.
  useEffect(() => {
    document.documentElement.dataset.offline = status.offlineState
  }, [status.offlineState])
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
          {/* The header chip is the way into Google Drive, so it names the cloud. */}
          <button
            className="connection-status cloud-status-button"
            aria-label="雲端同步"
            onClick={() => navigate('cloud')}
          >
            {status.online ? <Cloud size={15} /> : <CloudOff size={15} />}
            <span>
              {!status.online
                ? '雲端離線'
                : !cloud.target
                  ? '雲端未設定'
                  : cloud.busy
                    ? '雲端同步中'
                    : !cloud.connected
                      ? '雲端待連接'
                      : cloud.error
                        ? '雲端異常'
                        : cloud.conflicts.length
                          ? '雲端待處理'
                          : cloud.pendingCount || !cloud.state?.lastSync
                            ? '雲端待同步'
                            : '雲端已同步'}
            </span>
          </button>
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
          <LibraryScreen
            library={library}
            onRead={(book) => void openBook(book)}
            cloudReady={cloud.connected && !!cloud.target}
            onRemoveCloud={(books) => cloud.purgeOriginals(books)}
          />
        ) : screen === 'cloud' ? (
          <CloudLibraryScreen cloud={cloud} online={status.online} />
        ) : screen === 'storage' ? (
          <StorageScreen
            books={library.books}
            cloudConnected={cloud.connected}
            online={status.online}
            cloudError={cloud.error}
            busy={!!cloud.busy}
            onDownload={cloud.downloadBooks}
            onCloud={() => navigate('cloud')}
            onChanged={library.reload}
          />
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
            onStorage={() => navigate('storage')}
          />
        )}
        {screen === 'library' && settings.storageError && (
          <p className="inline-warning" role="alert">
            {settings.storageError}
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
