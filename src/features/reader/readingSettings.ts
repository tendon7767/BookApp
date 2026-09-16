import type { Theme } from '../settings/preferences'

export const readerFonts = {
  serif: { label: '宋體', css: "'Songti TC', 'Noto Serif CJK TC', 'Iowan Old Style', serif" },
  sans: {
    label: '黑體',
    css: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', sans-serif",
  },
  mono: { label: '等寬', css: "'SFMono-Regular', Consolas, 'PingFang TC', monospace" },
} as const
export const readerThemes = {
  paper: { label: '暖紙', foreground: '#303b34', background: '#f6f3ec' },
  light: { label: '明亮', foreground: '#2b3831', background: '#fafbfc' },
  dark: { label: '深夜', foreground: '#e3e8dd', background: '#191e1b' },
} as const
export interface ReadingSettings {
  fontFamily: keyof typeof readerFonts
  fontSize: number
  lineHeight: number
  paragraphSpacing: number
  margin: number
  theme: keyof typeof readerThemes
  textColor: string | null
  backgroundColor: string | null
  tapZones: 'horizontal' | 'vertical'
}
export const defaultReadingSettings: ReadingSettings = {
  fontFamily: 'serif',
  fontSize: 20,
  lineHeight: 1.8,
  paragraphSpacing: 0.8,
  margin: 24,
  theme: 'paper',
  textColor: null,
  backgroundColor: null,
  tapZones: 'horizontal',
}
function number(value: unknown, fallback: number, min: number, max: number, step: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.round(Math.min(max, Math.max(min, value)) / step) * step
}
function color(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
}
export function parseReadingSettings(
  value: unknown,
  fallbackTheme: Theme = 'paper',
): ReadingSettings {
  const data = value && typeof value === 'object' ? (value as Partial<ReadingSettings>) : {}
  // App-only palettes use the nearest reading theme until a reading default is saved.
  const readingFallback =
    fallbackTheme === 'graphite'
      ? 'dark'
      : fallbackTheme === 'mist'
        ? 'light'
        : fallbackTheme === 'sage'
          ? 'paper'
          : fallbackTheme
  return {
    fontFamily:
      data.fontFamily === 'sans' || data.fontFamily === 'mono' ? data.fontFamily : 'serif',
    fontSize: number(data.fontSize, 20, 14, 36, 1),
    lineHeight: Number(number(data.lineHeight, 1.8, 1.2, 2.4, 0.1).toFixed(1)),
    paragraphSpacing: Number(number(data.paragraphSpacing, 0.8, 0, 2, 0.1).toFixed(1)),
    margin: number(data.margin, 24, 8, 40, 2),
    theme:
      data.theme === 'paper' || data.theme === 'light' || data.theme === 'dark'
        ? data.theme
        : readingFallback,
    textColor: color(data.textColor),
    backgroundColor: color(data.backgroundColor),
    tapZones: data.tapZones === 'vertical' ? 'vertical' : 'horizontal',
  }
}
export function readingColors(settings: ReadingSettings) {
  const theme = readerThemes[settings.theme]
  return {
    foreground: settings.textColor ?? theme.foreground,
    background: settings.backgroundColor ?? theme.background,
  }
}
