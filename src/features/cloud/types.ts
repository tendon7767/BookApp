export interface DriveConfig {
  clientId: string
  apiKey: string
  appId: string
}
export interface DriveAccount {
  id: string
  name: string
  email: string
}
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: number
  version: string
  modifiedTime: string
  resourceKey?: string
  canDownload: boolean
}
export interface CloudBook extends DriveFile {
  accountId: string
  localBookId?: string
  downloadedVersion?: string
}
export interface CloudPreferences {
  config?: DriveConfig
  account?: DriveAccount
  target?: { accountId: string; id: string; name: string }
}

export function parseDriveConfig(value: Partial<DriveConfig>): DriveConfig {
  const clientId = value.clientId?.trim() ?? ''
  const apiKey = value.apiKey?.trim() ?? ''
  const appId = value.appId?.trim() ?? ''
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))
    throw new Error('請填入完整的 OAuth 用戶端 ID（結尾為 .apps.googleusercontent.com）。')
  if (!/^[\w-]{20,}$/.test(apiKey)) throw new Error('請填入 Google Picker API Key。')
  if (!/^\d+$/.test(appId)) throw new Error('專案編號須為數字，與專案 ID 不同。')
  return { clientId, apiKey, appId }
}
export function environmentConfig(): DriveConfig | undefined {
  try {
    return parseDriveConfig({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
      appId: import.meta.env.VITE_GOOGLE_APP_ID,
    })
  } catch {
    return undefined
  }
}
