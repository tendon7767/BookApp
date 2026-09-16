import { parseReadingSettings, type ReadingSettings } from '../features/reader/readingSettings'
import { parsePreferences, type Theme } from '../features/settings/preferences'
import { openReaderDatabase } from './database'

export async function readReadingSettings(bookId: string, fallbackTheme: Theme) {
  const db = await openReaderDatabase()
  try {
    const [bookSettings, app] = await Promise.all([
      db.get('readerSettings', bookId),
      db.get('preferences', 'app'),
    ])
    return parseReadingSettings(
      bookSettings?.settings ?? parsePreferences(app).readingDefaults,
      fallbackTheme,
    )
  } finally {
    db.close()
  }
}
export async function writeReadingSettings(bookId: string, settings: ReadingSettings) {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction(['books', 'readerSettings'], 'readwrite')
    if (await tx.objectStore('books').get(bookId))
      await tx
        .objectStore('readerSettings')
        .put({ settings: parseReadingSettings(settings), updatedAt: Date.now() }, bookId)
    await tx.done
  } finally {
    db.close()
  }
}
