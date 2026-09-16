import { openReaderDatabase } from './database'
import type { CloudBook, CloudPreferences, DriveFile } from '../features/cloud/types'

export async function readCloudPreferences(): Promise<CloudPreferences> {
  const db = await openReaderDatabase()
  try {
    return (await db.get('cloudPreferences', 'google')) ?? {}
  } finally {
    db.close()
  }
}
export async function writeCloudPreferences(value: CloudPreferences) {
  const db = await openReaderDatabase()
  try {
    await db.put('cloudPreferences', value, 'google')
  } finally {
    db.close()
  }
}
export async function listCloudBooks(accountId: string): Promise<CloudBook[]> {
  const db = await openReaderDatabase()
  try {
    return await db.getAllFromIndex('cloudBooks', 'by-account', accountId)
  } finally {
    db.close()
  }
}
// Keep local associations on refresh. A cloud update never overwrites local metadata/progress.
export async function rememberCloudFiles(accountId: string, files: DriveFile[]) {
  const db = await openReaderDatabase()
  try {
    const tx = db.transaction('cloudBooks', 'readwrite')
    void tx.done.catch(() => undefined)
    for (const file of files) {
      const previous = await tx.store.get([accountId, file.id])
      await tx.store.put({ ...previous, ...file, accountId })
    }
    await tx.done
  } finally {
    db.close()
  }
}
export async function associateCloudDownload(
  accountId: string,
  file: DriveFile,
  localBookId: string,
) {
  const db = await openReaderDatabase()
  try {
    await db.put('cloudBooks', { ...file, accountId, localBookId, downloadedVersion: file.version })
  } finally {
    db.close()
  }
}
