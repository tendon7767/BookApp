import { useState } from 'react'
import { Cloud, RefreshCw, FolderOpen, Search, Plus } from 'lucide-react'
import type { CloudLibraryState } from './useCloudLibrary'
import { CloudConfigForm } from './CloudConfigForm'
import type { Json } from './syncModel'

const labels: Record<string, string> = {
  alive: '保留在書架',
  title: '書名',
  author: '作者',
  category: '分類',
  series: '系列',
  volume: '集數',
  progress: '閱讀位置',
  marks: '書籤與跳轉足跡',
  core: '書籍資料',
  theme: '外觀',
  librarySort: '書架排序',
  seriesSort: '系列排序',
  pageAnimation: '翻頁效果',
  fontFamily: '字體',
  fontSize: '字級',
  lineHeight: '行距',
  paragraphSpacing: '段落間距',
  margin: '邊距',
  textColor: '文字顏色',
  backgroundColor: '背景顏色',
  tapZones: '點按翻頁區域',
}
function valueLabel(value: Json): string {
  if (value === true) return '保留'
  if (value === false) return '刪除'
  if (value === null) return '未設定'
  const choices: Record<string, string> = {
    paper: '暖紙',
    light: '明亮',
    dark: '深夜',
    graphite: '工程師深灰',
    mist: '霧藍',
    sage: '鼠尾草綠',
    serif: '宋體',
    sans: '黑體',
    mono: '等寬',
    recent: '最近閱讀',
    added: '最近加入',
    title: '書名',
    horizontal: '左右',
    vertical: '上下',
    volume: '集數順序',
    volumeDesc: '集數倒序',
    slide: '滑動',
    none: '關閉',
  }
  if (typeof value === 'string' && choices[value]) return choices[value]
  if (typeof value === 'object' && 'percentage' in value)
    return `${Math.round(Number(value.percentage) * 100)}% · ${new Date(Number(value.updatedAt)).toLocaleString('zh-TW')}`
  if (typeof value === 'object' && 'bookmarks' in value && 'trail' in value)
    return `${Array.isArray(value.bookmarks) ? value.bookmarks.length : 0} 個書籤 · ${Array.isArray(value.trail) ? value.trail.length : 0} 筆足跡`
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
export function CloudLibraryScreen({
  cloud,
  online,
}: {
  cloud: CloudLibraryState
  online: boolean
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const disabled = !!cloud.busy || !online || !cloud.connected
  const candidates = cloud.candidates ?? []
  const selectedCandidates = candidates.filter((entry) => chosen.has(entry.id))
  const deleted = Object.entries(cloud.values).filter(
    ([key, value]) => key.endsWith('/alive') && value === false,
  )
  return (
    <section className="cloud-screen" aria-label="雲端同步">
      <h2>
        <Cloud size={22} />
        Google Drive
      </h2>
      <p className="quiet-note">
        在 App 加入與管理書籍，Drive 自動保存書架、原檔、閱讀進度與設定。
      </p>
      <div className="cloud-account settings-card">
        <strong>{cloud.account?.email || '使用自己的 Google Drive'}</strong>
        <p className="quiet-note">
          {cloud.connected
            ? '已連接'
            : cloud.account
              ? '需要重新連接才能同步，本機資料仍保留。'
              : '連接後選擇備份位置。'}
        </p>
        <div className="cloud-actions">
          <button
            className="primary-button"
            disabled={!cloud.ready || !cloud.config || !cloud.sdkReady || !online || !!cloud.busy}
            onClick={() => void cloud.connect()}
          >
            {cloud.connected ? '切換帳號' : '連接 Google Drive'}
          </button>
          {cloud.connected && (
            <button className="secondary-button" disabled={!!cloud.busy} onClick={cloud.disconnect}>
              中斷連接
            </button>
          )}
        </div>
        {cloud.config && online && !cloud.sdkReady && !cloud.sdkError && (
          <p role="status" className="quiet-note">
            正在載入 Google 元件…
          </p>
        )}
      </div>
      {cloud.sdkError && (
        <div className="inline-warning">
          <p role="alert">{cloud.sdkError}</p>
          <button className="secondary-button" onClick={cloud.retrySdk}>
            重試載入 Google
          </button>
        </div>
      )}
      {cloud.error && (
        <p className="inline-warning" role="alert">
          {cloud.error}
        </p>
      )}
      {cloud.notice && (
        <p className="cloud-notice" role="status">
          {cloud.notice}
        </p>
      )}
      <div className="settings-card cloud-account">
        <strong>備份位置</strong>
        <p className="quiet-note">{cloud.target ? cloud.target.name : '尚未選擇'}</p>
        {cloud.target && (
          <a
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(cloud.target.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            在 Google Drive 查看
          </a>
        )}
        <p className="quiet-note">
          選擇資料夾後會在裡面建立「看書」。換裝置時選回同一位置；此處既有備份會與本機書架合併。
        </p>
        <div className="cloud-actions">
          <button
            className="secondary-button"
            disabled={disabled || !cloud.sdkReady}
            onClick={() => void cloud.choose()}
          >
            <FolderOpen size={18} />
            {cloud.target ? '變更備份位置' : '選擇備份位置'}
          </button>
          <button
            className="primary-button"
            disabled={disabled || !cloud.target}
            onClick={() => void cloud.sync()}
          >
            <RefreshCw size={18} />
            立即同步
          </button>
        </div>
      </div>
      {cloud.target && (
        <div className="settings-card cloud-account">
          <strong>從雲端加入新書</strong>
          <p className="quiet-note">
            把 EPUB／TXT 直接放進 Drive 的「{cloud.target.name}
            」資料夾即可；備份檔已改存在「備份資料」子資料夾，這裡只會列出尚未加入書架的書。
          </p>
          <div className="cloud-actions">
            <button
              className="secondary-button"
              disabled={disabled}
              onClick={() => {
                setChosen(new Set())
                void cloud.scanNewBooks()
              }}
            >
              <Search size={18} />
              查詢雲端新書
            </button>
            {!!candidates.length && (
              <button
                className="primary-button"
                disabled={disabled || !selectedCandidates.length}
                onClick={() => void cloud.importCloudBooks(selectedCandidates)}
              >
                <Plus size={18} />
                加入所選 ({selectedCandidates.length})
              </button>
            )}
          </div>
          {cloud.candidates && !candidates.length && (
            <p className="quiet-note">目前沒有尚未加入的檔案。</p>
          )}
          {!!candidates.length && (
            <>
              <button
                className="secondary-button cloud-select-all"
                disabled={!!cloud.busy}
                onClick={() =>
                  setChosen(
                    chosen.size === candidates.length
                      ? new Set()
                      : new Set(candidates.map((entry) => entry.id)),
                  )
                }
              >
                {chosen.size === candidates.length ? '取消全選' : '全選'}
              </button>
              <ul className="cloud-books">
                {candidates.map((entry) => (
                  <li key={entry.id}>
                    <label className="cloud-candidate">
                      <input
                        type="checkbox"
                        checked={chosen.has(entry.id)}
                        disabled={!!cloud.busy}
                        onChange={() =>
                          setChosen((previous) => {
                            const next = new Set(previous)
                            if (next.has(entry.id)) next.delete(entry.id)
                            else next.add(entry.id)
                            return next
                          })
                        }
                      />
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{Math.max(1, Math.round(entry.size / 1024 / 1024))} MB 以內</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="quiet-note">
                加入後會沿用 Drive 上的原檔，不會再上傳一份；重複內容不會重複加入書架。
              </p>
            </>
          )}
        </div>
      )}
      {cloud.target && (
        <div className="cloud-notice" role="status">
          <strong>
            {cloud.busy ||
              (cloud.pendingCount
                ? `${cloud.pendingCount} 項書籍／設定等待同步`
                : cloud.state?.lastSync
                  ? '已同步'
                  : '等待首次同步')}
          </strong>
          {cloud.state?.lastSync && (
            <p>上次成功：{new Date(cloud.state.lastSync).toLocaleString('zh-TW')}</p>
          )}
          {!online && <p>目前離線，恢復連線後再同步。</p>}
          {!cloud.connected && <p>請重新連接 Google Drive。</p>}
        </div>
      )}
      {cloud.busy && (
        <div className="cloud-notice">
          <p role="status">{cloud.busy}</p>
          <button className="secondary-button" onClick={cloud.cancel}>
            取消操作
          </button>
        </div>
      )}
      {!!cloud.conflicts.length && (
        <section className="cloud-conflicts" aria-label="同步衝突">
          <h3>同時修改的項目</h3>
          <p className="quiet-note">兩邊的值都已保留，選擇要繼續使用的版本。</p>
          {cloud.conflicts.map(([key, versions]) => {
            const [hash, field] = key.split('/')
            const label = labels[field.replace(/^(setting|default)/, '')] ?? field
            return (
              <div className="settings-card cloud-account" key={key}>
                <strong>
                  {hash === 'app' ? 'App 設定' : String(cloud.values[hash + '/title'] ?? '書籍')} ·{' '}
                  {label}
                </strong>
                {versions.map((version, index) => (
                  <button
                    key={index}
                    className="secondary-button cloud-conflict-choice"
                    disabled={!!cloud.busy}
                    onClick={() => void cloud.resolve(key, version.value)}
                  >
                    {valueLabel(version.value)}
                    <small>
                      {new Date(version.time).toLocaleString('zh-TW')} · 裝置{' '}
                      {version.device.slice(-4)}
                    </small>
                  </button>
                ))}
              </div>
            )
          })}
        </section>
      )}
      {!!deleted.length && (
        <details>
          <summary>找回已刪除書籍（{deleted.length}）</summary>
          <ul className="cloud-books">
            {deleted.map(([key]) => (
              <li key={key}>
                <strong>{String(cloud.values[key.replace('/alive', '/title')] ?? '書籍')}</strong>
                <button
                  className="secondary-button"
                  disabled={!!cloud.busy}
                  onClick={() => void cloud.resolve(key, true)}
                >
                  還原到書架
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!cloud.history.length && (
        <details>
          <summary>歷史備份</summary>
          <p className="quiet-note">
            每台裝置自動保留最近 10 份，較舊的會移到 Drive
            垃圾桶。還原會套用該版本的書架與設定，之後新增的書籍仍保留。原檔按需下載。
          </p>
          <ul className="cloud-books">
            {cloud.history.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.createdTime
                    ? new Date(entry.createdTime).toLocaleString('zh-TW')
                    : entry.name}
                </span>
                <button
                  className="secondary-button"
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm('以此版本還原書架與設定？此操作會再同步到其他裝置。'))
                      void cloud.restore(entry)
                  }}
                >
                  還原
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="quiet-note">
        變更會在 App 開啟且已連接 Google 時自動同步。關閉 App
        後無法保證背景上傳；大量匯入後，請等到顯示「已同步」。書籍原檔放在「
        {cloud.target?.name ?? '看書'}」資料夾，備份索引與封面放在其中的「備份資料」子資料夾。
      </p>
      <CloudConfigForm
        config={cloud.config}
        disabled={!cloud.ready || !!cloud.busy}
        onSave={cloud.saveConfig}
      />
    </section>
  )
}
