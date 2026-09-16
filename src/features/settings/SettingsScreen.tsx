import { useState } from 'react'
import { ReadingDefaultsDialog } from './ReadingDefaultsDialog'
import type { ReadingSettings } from '../reader/readingSettings'
import {
  Type,
  Terminal,
  CloudFog,
  Leaf,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  HardDrive,
  Moon,
  Sun,
  SunMedium,
} from 'lucide-react'
import type { PwaStatus } from '../../platform/usePwaStatus'
import type { AppPreferences, Theme } from './preferences'

const themes = [
  { id: 'paper', label: '暖紙', icon: SunMedium },
  { id: 'light', label: '明亮', icon: Sun },
  { id: 'dark', label: '深夜', icon: Moon },
  { id: 'graphite', label: '工程師深灰', icon: Terminal },
  { id: 'mist', label: '霧藍', icon: CloudFog },
  { id: 'sage', label: '鼠尾草綠', icon: Leaf },
] as const
const offlineDescriptions = {
  ready: 'App 已準備好，可離線開啟。',
  preparing: '正在準備離線內容，請保持網路連線。',
  error: '離線內容未能準備完成，請連線後重新開啟。',
  unsupported: '目前環境無法啟用離線功能，請用 HTTPS 網址開啟。',
  development: '開發預覽中；離線功能請使用正式建置測試。',
}
interface Props {
  preferences: AppPreferences
  disabled: boolean
  storageError: string | null
  status: PwaStatus
  onTheme: (theme: Theme) => Promise<void>
  onInstall: () => void
  onCloud: () => void
  onReadingDefaults: (settings: ReadingSettings) => Promise<void>
}

export function SettingsScreen({
  preferences,
  disabled,
  storageError,
  status,
  onTheme,
  onInstall,
  onReadingDefaults,
  onCloud,
}: Props) {
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  return (
    <section aria-label="設定" className="settings-screen">
      <section className="settings-section" aria-labelledby="appearance-title">
        <h2 id="appearance-title">外觀</h2>
        <div className="theme-options" role="group" aria-label="外觀主題">
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`theme-option theme-${id}`}
              aria-pressed={preferences.theme === id}
              disabled={disabled}
              onClick={() => void onTheme(id)}
            >
              <span className="theme-swatch" aria-hidden="true">
                <Icon size={21} />
                <span className="sample-glyph">字</span>
              </span>
              <span className="theme-name">
                {label}
                {preferences.theme === id && <Check size={15} />}
              </span>
            </button>
          ))}
        </div>
        {storageError && (
          <p className="inline-warning" role="alert">
            {storageError}
          </p>
        )}
      </section>
      <section className="settings-section" aria-labelledby="reading-defaults-title">
        <h2 id="reading-defaults-title">閱讀</h2>
        <div className="settings-card">
          <button
            className="settings-row interactive-row"
            disabled={disabled}
            onClick={() => setDefaultsOpen(true)}
          >
            <Type size={22} />
            <div>
              <strong>預設排版</strong>
              <p>字體、字級、行距與顏色；供未自訂排版的書籍使用</p>
            </div>
            <ChevronRight size={19} />
          </button>
        </div>
      </section>
      {defaultsOpen && (
        <ReadingDefaultsDialog
          preferences={preferences}
          onSave={onReadingDefaults}
          onClose={() => setDefaultsOpen(false)}
        />
      )}
      <section className="settings-section" aria-labelledby="device-title">
        <h2 id="device-title">這台裝置</h2>
        <div className="settings-card">
          <div className="settings-row">
            <HardDrive size={21} />
            <div>
              <strong>離線使用</strong>
              <p role="status">{offlineDescriptions[status.offlineState]}</p>
            </div>
            {status.offlineState === 'ready' && <Check size={18} />}
          </div>
          <button className="settings-row interactive-row" onClick={onInstall}>
            <CircleHelp size={21} />
            <div>
              <strong>加入主畫面</strong>
              <p>
                {status.standalone ? '目前以獨立 App 模式開啟' : '查看 iPhone 與其他裝置的安裝方式'}
              </p>
            </div>
            <ChevronRight size={19} />
          </button>
        </div>
        <p className="quiet-note">
          本機資料可能因裝置空間不足或清除網站資料而遺失。重要書籍請保留原檔。
        </p>
      </section>
      <section className="settings-section" aria-labelledby="cloud-title">
        <h2 id="cloud-title">雲端書庫</h2>
        <div className="settings-card">
          <button className="settings-row interactive-row" onClick={onCloud}>
            <Cloud size={22} />
            <div>
              <strong>Google Drive</strong>
              <p>自動同步書架、進度與設定，換裝置也能還原。</p>
            </div>
            <ChevronRight size={19} />
          </button>
        </div>
      </section>
      <footer className="settings-footer">
        <span>書庫預覽版 · 0.2.0</span>
      </footer>
    </section>
  )
}
