import { useEffect, useRef, type ReactNode } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import {
  defaultReadingSettings,
  readerFonts,
  readerThemes,
  readingColors,
  type ReadingSettings,
} from './readingSettings'

export function TypographyPanel({
  settings,
  onChange,
  onClose,
  savingError,
  title = '排版',
  note = '本書專用 · 使用裝置字體',
  preview = false,
  footer,
  busy = false,
}: {
  settings: ReadingSettings
  onChange: (settings: ReadingSettings) => void
  onClose: () => void
  savingError: boolean
  title?: string
  note?: string
  preview?: boolean
  footer?: ReactNode
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const colors = readingColors(settings)
  const change = (patch: Partial<ReadingSettings>) => onChange({ ...settings, ...patch })
  return (
    <dialog
      ref={ref}
      className={`typography-panel${preview ? ' default-typography-panel' : ''}`}
      aria-labelledby="typography-title"
      onCancel={(e) => {
        if (busy) e.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="typography-header">
        <h2 id="typography-title">{title}</h2>
        <button className="icon-button" aria-label="關閉排版" disabled={busy} onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <fieldset className="typography-content" disabled={busy}>
        {preview && (
          <div
            className="typography-preview"
            aria-label="排版預覽"
            style={{
              fontFamily: readerFonts[settings.fontFamily].css,
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
              color: colors.foreground,
              background: colors.background,
              paddingInline: settings.margin,
            }}
          >
            <p style={{ marginBottom: settings.paragraphSpacing + 'em' }}>
              窗邊的光落在書頁上，故事從這裡開始。
            </p>
            <p>依照你的習慣，調整舒服的閱讀排版。</p>
          </div>
        )}
        <label className="typography-row">
          <span>字體</span>
          <select
            aria-label="字體"
            value={settings.fontFamily}
            onChange={(event) =>
              change({ fontFamily: event.target.value as ReadingSettings['fontFamily'] })
            }
          >
            {Object.entries(readerFonts).map(([id, font]) => (
              <option key={id} value={id}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <div className="typography-row">
          <span>字級</span>
          <div className="font-size-control">
            <button
              aria-label="縮小字級"
              disabled={settings.fontSize <= 14}
              onClick={() => change({ fontSize: settings.fontSize - 1 })}
            >
              <Minus size={18} />
            </button>
            <output aria-label="目前字級">{settings.fontSize}</output>
            <button
              aria-label="放大字級"
              disabled={settings.fontSize >= 36}
              onClick={() => change({ fontSize: settings.fontSize + 1 })}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        {(
          [
            ['lineHeight', '行距', 1.2, 2.4, 0.1],
            ['paragraphSpacing', '段落間距', 0, 2, 0.1],
            ['margin', '左右邊距', 8, 40, 2],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label className="typography-row" key={key}>
            <span>{label}</span>
            <input
              aria-label={label}
              type="range"
              min={min}
              max={max}
              step={step}
              value={settings[key]}
              onChange={(event) => change({ [key]: Number(event.target.value) })}
            />
            <output>
              {settings[key]}
              {key === 'margin' ? 'px' : ''}
            </output>
          </label>
        ))}
        <div className="reading-theme-options" role="group" aria-label="閱讀主題">
          {Object.entries(readerThemes).map(([id, theme]) => (
            <button
              key={id}
              style={{ background: theme.background, color: theme.foreground }}
              aria-pressed={
                settings.theme === id && !settings.textColor && !settings.backgroundColor
              }
              onClick={() =>
                change({
                  theme: id as ReadingSettings['theme'],
                  textColor: null,
                  backgroundColor: null,
                })
              }
            >
              {theme.label}
            </button>
          ))}
        </div>
        <div className="tap-zone-options" role="group" aria-label="點按翻頁區域">
          <span>點按翻頁</span>
          <button
            aria-pressed={settings.tapZones === 'horizontal'}
            onClick={() => change({ tapZones: 'horizontal' })}
          >
            左右
          </button>
          <button
            aria-pressed={settings.tapZones === 'vertical'}
            onClick={() => change({ tapZones: 'vertical' })}
          >
            上下
          </button>
        </div>
        <div className="custom-colors">
          <label>
            文字色
            <input
              aria-label="文字顏色"
              type="color"
              value={colors.foreground}
              onChange={(event) => change({ textColor: event.target.value })}
            />
          </label>
          <label>
            背景色
            <input
              aria-label="背景顏色"
              type="color"
              value={colors.background}
              onChange={(event) => change({ backgroundColor: event.target.value })}
            />
          </label>
          <button onClick={() => onChange({ ...defaultReadingSettings })}>重設排版</button>
        </div>
        {savingError && (
          <p role="alert" className="quiet-note">
            設定未能保存，請重試調整或稍後再返回書架。
          </p>
        )}
        <p className="typography-note">{note}</p>
      </fieldset>
      {footer}
    </dialog>
  )
}
