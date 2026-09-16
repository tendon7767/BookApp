import type { DriveConfig } from './types'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
interface TokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
}
interface TokenClient {
  requestAccessToken(config: { prompt: string }): void
}
interface PickerView {
  setIncludeFolders(value: boolean): PickerView
  setSelectFolderEnabled(value: boolean): PickerView
  setMode(value: string): PickerView
  setMimeTypes(value: string): PickerView
}
interface Picker {
  setVisible(value: boolean): void
  dispose(): void
}
interface PickerBuilder {
  addView(view: PickerView): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setOrigin(origin: string): PickerBuilder
  setLocale(locale: string): PickerBuilder
  setTitle(title: string): PickerBuilder
  enableFeature(feature: string): PickerBuilder
  setCallback(
    callback: (data: { action: string; docs?: { id: string; resourceKey?: string }[] }) => void,
  ): PickerBuilder
  build(): Picker
}
interface GoogleSdk {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        include_granted_scopes: boolean
        callback: (response: TokenResponse) => void
        error_callback: (error: { type: string }) => void
      }): TokenClient
    }
  }
  picker: {
    PickerBuilder: new () => PickerBuilder
    DocsView: new () => PickerView
    DocsUploadView: new () => PickerView
    DocsViewMode: { LIST: string }
    Feature: { MULTISELECT_ENABLED: string }
    Action: { PICKED: string; CANCEL: string }
  }
}
declare global {
  interface Window {
    google?: GoogleSdk
    gapi?: {
      load(
        module: string,
        options: {
          callback: () => void
          onerror: () => void
          timeout: number
          ontimeout: () => void
        },
      ): void
    }
  }
}
const loadingScripts = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  const existing = loadingScripts.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      clearTimeout(timer)
      script.remove()
      reject(new Error('Google 元件載入失敗，請確認網路後重試。'))
    }
    const timer = setTimeout(fail, 20000)
    script.src = src
    script.async = true
    script.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    script.onerror = fail
    document.head.append(script)
  })
  loadingScripts.set(src, promise)
  void promise.catch(() => loadingScripts.delete(src))
  return promise
}
let sdkLoading: Promise<void> | undefined
export function loadGoogleSdk(): Promise<void> {
  if (window.google?.accounts?.oauth2 && window.google?.picker) return Promise.resolve()
  if (sdkLoading) return sdkLoading
  sdkLoading = (async () => {
    await Promise.all([
      loadScript('https://accounts.google.com/gsi/client'),
      loadScript('https://apis.google.com/js/api.js'),
    ])
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error('Google 選檔器未能載入，請重試。'))
      if (!window.gapi) return fail()
      window.gapi.load('picker', {
        callback: resolve,
        onerror: fail,
        timeout: 20000,
        ontimeout: fail,
      })
    })
    if (!window.google?.accounts?.oauth2 || !window.google?.picker)
      throw new Error('Google 元件尚未就緒，請重試。')
  })()
  void sdkLoading.catch(() => {
    sdkLoading = undefined
  })
  return sdkLoading
}

// Must be called directly from the click handler, with the SDK already loaded.
export function authorizeDrive(
  config: DriveConfig,
  signal: AbortSignal,
): Promise<{ token: string; expiresAt: number }> {
  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (error?: Error, result?: { token: string; expiresAt: number }) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
      else if (result) resolve(result)
    }
    const abort = () => finish(new DOMException('已取消', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('Google 連接逾時，請重試。')), 120000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) return abort()
    if (!window.google?.accounts?.oauth2) return finish(new Error('請等待 Google 元件載入。'))
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: false,
        callback: (response) => {
          if (
            response.error ||
            !response.access_token ||
            !response.scope?.split(' ').includes(DRIVE_SCOPE)
          )
            return finish(new Error('尚未授權存取所選書籍，請重新連接並允許權限。'))
          const expiresIn = Number(response.expires_in)
          if (!Number.isFinite(expiresIn) || expiresIn <= 30)
            return finish(new Error('Google 授權已過期，請重新連接。'))
          finish(undefined, {
            token: response.access_token,
            expiresAt: Date.now() + (expiresIn - 30) * 1000,
          })
        },
        error_callback: ({ type }) =>
          finish(
            new Error(
              type === 'popup_closed'
                ? '已取消 Google 連接。'
                : 'Google 登入視窗無法開啟。請允許此網站的彈出式視窗，再按一次連接。',
            ),
          ),
      })
      client.requestAccessToken({ prompt: 'select_account' })
    } catch {
      finish(new Error('Google 連接無法啟動，請檢查應用程式設定後重試。'))
    }
  })
}

export function pickDriveFolder(
  config: DriveConfig,
  token: string,
  signal: AbortSignal,
): Promise<{ id: string; resourceKey?: string }[]> {
  return new Promise((resolve, reject) => {
    const api = window.google?.picker
    if (!api) return reject(new Error('Google 選檔器尚未就緒。'))
    let picker: Picker | undefined
    let finished = false
    const finish = (files: { id: string; resourceKey?: string }[], error?: Error) => {
      if (finished) return
      finished = true
      signal.removeEventListener('abort', abort)
      picker?.dispose()
      if (error) reject(error)
      else resolve(files)
    }
    const abort = () => finish([], new DOMException('已取消', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) return abort()
    try {
      picker = new api.PickerBuilder()
        .addView(
          new api.DocsView()
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder')
            .setMode(api.DocsViewMode.LIST),
        )
        .setOAuthToken(token)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .setOrigin(window.location.origin)
        .setLocale('zh-TW')
        .setTitle('選擇備份位置，或既有的「看書」資料夾')
        .setCallback((data) => {
          if (data.action === api.Action.CANCEL) finish([])
          if (data.action === api.Action.PICKED)
            finish((data.docs ?? []).filter((doc) => typeof doc.id === 'string'))
        })
        .build()
      picker.setVisible(true)
    } catch {
      finish([], new Error('Google 選檔器無法開啟，請確認 API Key 與專案編號。'))
    }
  })
}
