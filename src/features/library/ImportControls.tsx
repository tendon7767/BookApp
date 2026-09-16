import { useRef, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { LibraryState } from './useLibrary'
import { ImportReport } from './ImportReport'

export function ImportControls({
  library,
  children,
  selecting = false,
}: {
  library: LibraryState
  children: ReactNode
  selecting?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="import-controls">
      <input
        ref={input}
        type="file"
        accept=".epub,.txt,application/epub+zip,text/plain"
        multiple
        className="file-input"
        aria-label="選擇書籍檔案"
        disabled={library.loading || !!library.progress || !!library.error}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          void library.importFiles(files)
        }}
      />
      <div
        className={`library-actions ${selecting ? 'is-selecting' : 'is-browsing'}`}
        role="toolbar"
        aria-label="書庫操作"
      >
        {!selecting && (
          <>
            <span className="library-total count-label" role="status">
              {library.loading ? '讀取中…' : `${library.books.length} 本書`}
            </span>
            <button
              className="library-action"
              aria-label="加入書籍"
              disabled={library.loading || !!library.progress || !!library.error}
              onClick={() => input.current?.click()}
            >
              <Plus size={18} />
              <span>{library.progress ? '匯入中' : '加入書籍'}</span>
            </button>
          </>
        )}
        {children}
      </div>

      {!library.books.length && <span className="import-hint">EPUB / TXT · 每本最高 50 MB</span>}
      {library.progress && (
        <div role="status" className="import-progress">
          <p>
            正在匯入 {library.progress.current} / {library.progress.total}：{library.progress.name}
          </p>
          <progress
            value={library.progress.current - 1}
            max={library.progress.total}
            aria-label="匯入進度"
          />
          <span>請保持畫面開啟，檔案儲存完成後會出現在書架。</span>
        </div>
      )}
      {!!library.notices.length && !library.progress && (
        <ImportReport notices={library.notices} onDismiss={library.clearNotices} />
      )}
    </div>
  )
}
