import { parseReadingSettings, type ReadingSettings } from '../reader/readingSettings'
import { seriesSorts, type SeriesSort } from '../library/seriesView'
export type Theme = 'paper' | 'light' | 'dark' | 'graphite' | 'mist' | 'sage'
export interface AppPreferences {
  theme: Theme
  readingDefaults?: ReadingSettings
  librarySort?: 'recent' | 'added' | 'title'
  seriesSort?: SeriesSort
}
export const defaultPreferences: AppPreferences = { theme: 'paper' }

export function parsePreferences(value: unknown): AppPreferences {
  if (typeof value !== 'object' || value === null || !('theme' in value)) {
    return { ...defaultPreferences }
  }
  const theme = value.theme
  const parsedTheme =
    theme === 'light' ||
    theme === 'dark' ||
    theme === 'paper' ||
    theme === 'graphite' ||
    theme === 'mist' ||
    theme === 'sage'
      ? theme
      : 'paper'
  return {
    theme: parsedTheme,
    ...('librarySort' in value && ['recent', 'added', 'title'].includes(String(value.librarySort))
      ? { librarySort: value.librarySort as AppPreferences['librarySort'] }
      : {}),
    ...('seriesSort' in value && seriesSorts.includes(String(value.seriesSort) as SeriesSort)
      ? { seriesSort: value.seriesSort as SeriesSort }
      : {}),
    ...('readingDefaults' in value && value.readingDefaults
      ? { readingDefaults: parseReadingSettings(value.readingDefaults, parsedTheme) }
      : {}),
  }
}
