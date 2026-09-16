import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { makeEpub } from '../tests/fixtures/epub.ts'

test.use({ serviceWorkers: 'block' })
const sdk = `
window.__cloudTest = { account: 'a', deny: false, cancel: false };
window.google = { accounts: { oauth2: { initTokenClient(options) {
 return { requestAccessToken() { setTimeout(() => options.callback({ access_token: 'test-' + window.__cloudTest.account, expires_in: 3600, scope: window.__cloudTest.deny ? '' : 'https://www.googleapis.com/auth/drive.file' }), 0) } };
} } }, picker: {
 Action: {PICKED: 'picked', CANCEL: 'cancel'}, DocsViewMode: {LIST: 'list'},
 DocsView: class { setIncludeFolders(){return this} setSelectFolderEnabled(v){if(!v)throw Error('Must select folders');return this} setMimeTypes(v){if(v!=='application/vnd.google-apps.folder')throw Error('Folder filter missing');return this} setMode(){return this} },
 PickerBuilder: class {
 addView(){return this} setOAuthToken(){return this} setDeveloperKey(){return this} setAppId(){return this} setOrigin(){return this} setLocale(){return this} setTitle(){return this}
 setCallback(fn){this.callback=fn;return this}
 build(){const callback=this.callback;return {dispose(){},setVisible(){setTimeout(()=>callback({action:window.__cloudTest.cancel?'cancel':'picked',docs:[{id:'parent'}]}),0)}}}
 }
}}; window.gapi = {load(name,options){options.callback()}};
`
interface Entry {
  id: string
  name: string
  mimeType: string
  size?: string
  parents?: string[]
  appProperties?: Record<string, string>
  capabilities?: { canAddChildren: boolean }
  createdTime?: string
}
function driveMock() {
  const entries = new Map<string, Entry>([
    [
      'parent',
      {
        id: 'parent',
        name: '測試資料夾',
        mimeType: 'application/vnd.google-apps.folder',
        capabilities: { canAddChildren: true },
      },
    ],
  ])
  const bodies = new Map<string, Buffer>()
  const sessions = new Map<string, { meta: Entry; chunks: Buffer[]; type: string }>()
  let seq = 0,
    fail = 0,
    downloads = 0,
    corrupt = false
  async function install(context: BrowserContext) {
    await context.route('https://**/*', (route) => route.abort())
    await context.route('https://accounts.google.com/gsi/client', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: sdk }),
    )
    await context.route('https://apis.google.com/js/api.js', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: '' }),
    )
    await context.route('https://www.googleapis.com/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url())
      expect(req.headers().authorization).toMatch(/^Bearer test-[ab]$/)
      expect(url.search).not.toContain('test-a')
      if (fail) return route.fulfill({ status: fail, body: '{}' })
      if (url.pathname.endsWith('/about'))
        return route.fulfill({
          json: {
            user: {
              permissionId: req.headers().authorization.endsWith('-b') ? 'b' : 'a',
              displayName: '測試帳號',
              emailAddress: 'reader@example.test',
            },
          },
        })
      if (url.pathname.endsWith('/generateIds'))
        return route.fulfill({ json: { ids: ['id-' + ++seq] } })
      if (url.pathname.startsWith('/upload/')) {
        if (req.method() === 'POST') {
          const meta = req.postDataJSON() as Entry
          sessions.set(meta.id, { meta, chunks: [], type: req.headers()['x-upload-content-type'] })
          return route.fulfill({
            headers: {
              Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=' + meta.id,
              'Access-Control-Expose-Headers': 'Location, Range',
            },
            body: '',
          })
        }
        const s = sessions.get(url.searchParams.get('upload_id')!)!
        s.chunks.push(req.postDataBuffer()!)
        const range = req.headers()['content-range'].match(/bytes (\d+)-(\d+)\/(\d+)/)!
        if (Number(range[2]) + 1 < Number(range[3]))
          return route.fulfill({
            status: 308,
            headers: { Range: 'bytes=0-' + range[2], 'Access-Control-Expose-Headers': 'Range' },
            body: '',
          })
        const body = Buffer.concat(s.chunks)
        entries.set(s.meta.id, {
          ...s.meta,
          mimeType: s.type,
          size: String(body.length),
          createdTime: new Date().toISOString(),
        })
        bodies.set(s.meta.id, body)
        return route.fulfill({ json: { id: s.meta.id } })
      }
      const id = url.pathname.split('/').pop()!
      if (id === 'files') {
        if (req.method() === 'POST') {
          const meta = req.postDataJSON() as Entry
          const folder = { ...meta, id: 'folder-' + ++seq, capabilities: { canAddChildren: true } }
          entries.set(folder.id, folder)
          return route.fulfill({ json: folder })
        }
        const parent = url.searchParams.get('q')?.match(/^'([^']+)' in parents/)?.[1]
        return route.fulfill({
          json: {
            files: [...entries.values()].filter((entry) => entry.parents?.includes(parent!)),
          },
        })
      }
      const entry = entries.get(id)
      if (!entry) return route.fulfill({ status: 404, body: '{}' })
      if (url.searchParams.get('alt') === 'media') {
        if (entry.appProperties?.kanshu === 'book-v1') downloads++
        return route.fulfill({
          contentType: entry.mimeType,
          body:
            corrupt && entry.appProperties?.kanshu === 'book-v1'
              ? Buffer.from('bad')
              : bodies.get(id)!,
        })
      }
      return route.fulfill({ json: entry })
    })
  }
  return {
    install,
    entries,
    bodies,
    fail: (n: number) => {
      fail = n
    },
    corrupt: (v: boolean) => {
      corrupt = v
    },
    downloads: () => downloads,
  }
}
async function cloudScreen(page: Page) {
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: /Google Drive/ }).click()
}
async function configure(page: Page) {
  await page.getByLabel('OAuth Client ID').fill('123-test.apps.googleusercontent.com')
  await page.getByLabel('Picker API Key').fill('AIza-test-public-key-only-1234567890')
  await page.getByLabel('專案編號').fill('123456')
  await page.getByRole('button', { name: '儲存 Google 設定', exact: true }).click()
  await expect(page.getByRole('button', { name: '連接 Google Drive', exact: true })).toBeEnabled()
}
async function connect(page: Page) {
  await page.getByRole('button', { name: '連接 Google Drive', exact: true }).click()
  await expect(page.getByRole('button', { name: /選擇備份位置|變更備份位置/ })).toBeEnabled()
}
async function sync(page: Page) {
  const button = page.getByRole('button', { name: '立即同步', exact: true })
  await expect(button).toBeEnabled({ timeout: 15000 })
  await button.click()
  await expect(page.getByText('書架、原檔與設定已同步。', { exact: true })).toBeVisible({
    timeout: 20000,
  })
}
async function setState(page: Page, value: Record<string, unknown>) {
  await page.evaluate(
    (value) => Object.assign((window as unknown as { __cloudTest: object }).__cloudTest, value),
    value,
  )
}

test('App imports back up into a selected folder and a fresh device restores the shelf before downloading books', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120000)
  const fake = driveMock()
  await fake.install(context)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles([
    {
      name: '雲端小說.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一章\n' + '測試用小說內容。\n'.repeat(400)),
    },
    { name: '書頁.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await makeEpub()) },
  ])
  await expect(page.getByText('2 本書', { exact: true })).toBeVisible()
  await cloudScreen(page)
  await configure(page)
  await setState(page, { deny: true })
  await page.getByRole('button', { name: '連接 Google Drive', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('尚未授權')
  await setState(page, { deny: false })
  await connect(page)
  await setState(page, { cancel: true })
  await page.getByRole('button', { name: '選擇備份位置', exact: true }).click()
  await expect(page.getByRole('button', { name: '選擇備份位置', exact: true })).toBeEnabled()
  expect(
    [...fake.entries.values()].filter((e) => e.appProperties?.kanshu === 'library-v1'),
  ).toHaveLength(0)
  await setState(page, { cancel: false })
  await page.getByRole('button', { name: '選擇備份位置', exact: true }).click()
  await expect(page.getByRole('button', { name: '變更備份位置', exact: true })).toBeEnabled()
  await sync(page)
  const folder = [...fake.entries.values()].find((e) => e.appProperties?.kanshu === 'library-v1')!
  expect(folder.parents).toEqual(['parent'])
  expect(
    [...fake.entries.values()].filter((e) => e.appProperties?.kanshu === 'book-v1'),
  ).toHaveLength(2)
  expect(
    [...fake.entries.values()]
      .filter((e) => e.appProperties?.kanshu === 'snapshot-v1')
      .every((e) => e.parents?.[0] === folder.id),
  ).toBe(true)
  // All metadata writes use normal repositories in production; inspect their backup after a UI theme edit.
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: '工程師深灰', exact: true }).click()
  await page.getByRole('button', { name: /Google Drive/ }).click()
  await sync(page)
  await page.screenshot({ path: testInfo.outputPath('cloud-sync.png') })
  const fresh = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 393, height: 852 },
  })
  try {
    await fake.install(fresh)
    const p = await fresh.newPage()
    p.on('pageerror', (e) => errors.push(e.message))
    await p.goto('http://localhost:4173/BookApp/')
    await cloudScreen(p)
    await configure(p)
    await connect(p)
    await p.getByRole('button', { name: '選擇備份位置', exact: true }).click()
    await sync(p)
    expect(fake.downloads()).toBe(0)
    await expect(p.locator('html')).toHaveAttribute('data-theme', 'graphite')
    // Independent offline edits to the same preference remain selectable, then converge.
    await page.getByRole('button', { name: '中斷連接', exact: true }).click()
    await p.getByRole('button', { name: '中斷連接', exact: true }).click()
    for (const [device, theme] of [
      [page, '鼠尾草綠'],
      [p, '霧藍'],
    ] as const) {
      await device.getByRole('button', { name: '返回書架', exact: true }).click()
      await device.getByRole('button', { name: '設定', exact: true }).click()
      await device.getByRole('button', { name: theme, exact: true }).click()
      await device.getByRole('button', { name: /Google Drive/ }).click()
    }
    await connect(page)
    await sync(page)
    await connect(p)
    await p.getByRole('button', { name: '立即同步', exact: true }).click()
    const conflict = p.getByRole('region', { name: '同步衝突' })
    await expect(conflict).toBeVisible()
    await conflict.getByRole('button', { name: /鼠尾草綠/ }).click()
    await expect(conflict).toHaveCount(0)
    await sync(p)
    await expect(p.locator('html')).toHaveAttribute('data-theme', 'sage')
    await sync(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sage')
    await p.getByRole('button', { name: '返回書架', exact: true }).click()
    await expect(p.getByText('2 本書', { exact: true })).toBeVisible()
    await p.getByRole('button', { name: '開啟 雲端小說', exact: true }).click()
    await expect(p.getByRole('button', { name: '下載並閱讀', exact: true })).toBeVisible()
    fake.corrupt(true)
    await p.getByRole('button', { name: '下載並閱讀', exact: true }).click()
    await expect(p.getByRole('alert')).toContainText('大小與備份不符')
    fake.corrupt(false)
    await p.getByRole('button', { name: '返回書架', exact: true }).click()
    await p.getByRole('button', { name: '開啟 雲端小說', exact: true }).click()
    await p.getByRole('button', { name: '下載並閱讀', exact: true }).click()
    await expect(p.getByRole('button', { name: '閱讀選單', exact: true })).toBeVisible()
    // Exit and remove only downloaded bytes; progress and shelf remain.
    await p.getByRole('button', { name: '閱讀選單', exact: true }).click()
    await p.getByRole('button', { name: '返回書架', exact: true }).click()
    await p.getByRole('button', { name: '開啟 雲端小說', exact: true }).click()
    await expect(p.getByRole('button', { name: '開始閱讀', exact: true })).toBeVisible()
    await p.getByRole('button', { name: '僅移除本機下載（保留進度）', exact: true }).click()
    await p.getByRole('button', { name: '開啟 雲端小說', exact: true }).click()
    await expect(p.getByRole('button', { name: '下載並閱讀', exact: true })).toBeVisible()
    await p.getByRole('button', { name: '從書架刪除', exact: true }).click()
    await p.getByRole('button', { name: '確認刪除 1 本', exact: true }).click()
    await expect(p.getByText('1 本書', { exact: true })).toBeVisible()
    await cloudScreen(p)
    await sync(p)
    await expect(p.getByText('找回已刪除書籍（1）', { exact: true })).toBeVisible()
    await p.getByText('找回已刪除書籍（1）', { exact: true }).click()
    await p.getByRole('button', { name: '還原到書架', exact: true }).click()
    await sync(p)
    fake.fail(401)
    await p.getByRole('button', { name: '立即同步', exact: true }).click()
    await expect(p.getByRole('alert')).toContainText('過期')
    fake.fail(0)
    await connect(p)
    await p.reload()
    await cloudScreen(p)
    await expect(p.getByRole('button', { name: '連接 Google Drive', exact: true })).toBeEnabled()
    expect(await p.evaluate(() => localStorage.getItem('access_token'))).toBeNull()
  } finally {
    await fresh.close()
  }
  expect(errors).toEqual([])
})
