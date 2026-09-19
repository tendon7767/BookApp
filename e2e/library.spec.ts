import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { preview } from 'vite'
import { makeEpub } from '../tests/fixtures/epub.ts'

test('imports EPUB 2, EPUB 3 and TXT, deduplicates renamed files and deletes only a selected book', async ({
  page,
}) => {
  const epub2 = Buffer.from(await makeEpub({ version: '2.0', title: '微光之間' }))
  const epub3 = Buffer.from(await makeEpub({ title: '午後的書頁' }))
  await page.goto('./')
  const input = page.getByLabel('選擇書籍檔案')
  await expect(input).toBeEnabled()
  await input.setInputFiles([
    { name: 'legacy.epub', mimeType: 'application/epub+zip', buffer: epub2 },
    { name: 'afternoon.epub', mimeType: 'application/epub+zip', buffer: epub3 },
    {
      name: '長夜的旅人.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一章\n這是一段測試用的原創文字。'),
    },
  ])
  await expect(page.getByText('3 本書', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '加入書籍', exact: true })).toBeEnabled()
  const card = page.getByRole('button', { name: '書籍資訊 午後的書頁', exact: true })
  const cover = page
    .getByRole('button', { name: '書籍資訊 午後的書頁', exact: true })
    .locator('img')
  await expect(cover).toBeVisible()
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await input.setInputFiles({
    name: '改了檔名.epub',
    mimeType: 'application/epub+zip',
    buffer: epub3,
  })
  await expect(page.getByRole('region', { name: '匯入結果' })).toContainText('1 本重複')
  await page.getByRole('button', { name: '查看詳情', exact: true }).click()
  await expect(page.getByRole('region', { name: '匯入結果' })).toContainText('未重複加入')
  await expect(page.getByText('3 本書', { exact: true })).toBeVisible()
  await page.reload()
  await expect(card).toBeVisible()
  await card.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('看書測試作者')
  await expect(dialog).toContainText('afternoon.epub')
  await dialog.getByRole('button', { name: '刪除書籍' }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(card).toBeAttached()
  await dialog.getByRole('button', { name: '刪除書籍' }).click()
  await dialog.getByRole('button', { name: '確認刪除 1 本', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('2 本書', { exact: true })).toBeVisible()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '書籍資訊 微光之間' })).toBeVisible()
  await expect(page.getByRole('button', { name: '書籍資訊 長夜的旅人' })).toBeVisible()
})

test('a failed file does not stop the batch and an 8 MB TXT is stored byte-for-byte', async ({
  page,
}) => {
  const largeText = Buffer.alloc(8 * 1024 * 1024 + 17, 0x61)
  // Include legacy-encoding bytes: importing must not re-encode the source.
  largeText.set([0xb4, 0xfa, 0xb8, 0xd5, 0x0d, 0x0a], 0)
  const expectedHash = createHash('sha256').update(largeText).digest('hex')
  await page.goto('./')
  await expect(page.getByLabel('選擇書籍檔案')).toBeEnabled()
  await page.getByLabel('選擇書籍檔案').setInputFiles([
    { name: '損壞.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('not a zip') },
    { name: '其他.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') },
    { name: '空白.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    { name: '長篇測試.txt', mimeType: 'text/plain', buffer: largeText },
  ])
  await expect(page.getByText('1 本書', { exact: true })).toBeVisible()
  const report = page.getByRole('region', { name: '匯入結果' })
  await expect(report).toContainText('已加入 1 本，3 本失敗')
  await expect(report.locator('li')).toHaveCount(0)
  await page.getByRole('button', { name: '查看詳情', exact: true }).click()
  await expect(report).toContainText('不是可讀取的 EPUB')
  await expect(report).toContainText('其他格式稍後支援')
  await expect(report).toContainText('檔案是空的')
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kanshu-local')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const stored = await new Promise<{ bytes: ArrayBuffer; mimeType: string }>(
        (resolve, reject) => {
          const request = database.transaction('bookFiles').objectStore('bookFiles').openCursor()
          request.onsuccess = () => resolve(request.result!.value)
          request.onerror = () => reject(request.error)
        },
      )
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', stored.bytes))
      return {
        size: stored.bytes.byteLength,
        hash: Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      }
    } finally {
      database.close()
    }
  })
  expect(stored).toEqual({ size: largeText.length, hash: expectedHash })
})

test('imports an EPUB for the first time after the origin is stopped and retains it on reopen', async ({
  page,
  context,
}) => {
  const server = await preview({ preview: { host: 'localhost', port: 0, strictPort: true } })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Preview address unavailable')
  const url = `http://localhost:${address.port}/BookApp/`
  const stop = async () => {
    if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections()
    await server.close()
  }
  let stopped = false
  try {
    await page.goto(url)
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready')
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await stop()
    stopped = true
    await page.getByLabel('選擇書籍檔案').setInputFiles({
      name: 'offline.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(await makeEpub({ title: '離線的故事' })),
    })
    await expect(page.getByText('1 本書', { exact: true })).toBeVisible()
    const reopened = await context.newPage()
    await page.close()
    await reopened.goto(url)
    const book = reopened.getByRole('button', { name: '書籍資訊 離線的故事' })
    await expect(book).toBeVisible()
    await expect(book.locator('img')).toBeVisible()
    // The reader chunk has never been requested online; it must be in the shell cache.
    await book.click()
    await reopened.getByRole('button', { name: '開始閱讀', exact: true }).click()
    await expect(reopened.getByRole('button', { name: '閱讀選單', exact: true })).toBeVisible()
    await expect(
      reopened.frameLocator('.epub-host iframe').getByText('窗邊，一本書翻開了新的故事。'),
    ).toBeVisible()
    await reopened.getByRole('button', { name: '閱讀選單', exact: true }).click()
    await reopened.getByRole('button', { name: '閱讀排版' }).click()
    await reopened.getByRole('button', { name: '放大字級' }).click()
    await reopened.getByRole('button', { name: '關閉排版' }).click()
    await expect(reopened.getByRole('button', { name: '返回書架' })).toBeEnabled()
    await expect(reopened.frameLocator('.epub-host iframe').locator('p').first()).toHaveCSS(
      'font-size',
      '21px',
    )
    await reopened.getByRole('button', { name: '返回書架', exact: true }).click()
    await reopened.getByRole('button', { name: '書籍資訊 離線的故事', exact: true }).click()
    await reopened.getByRole('button', { name: '編輯書籍資訊', exact: true }).click()
    await reopened.getByRole('textbox', { name: '書名', exact: true }).fill('離線改名')
    await reopened.getByLabel('分類', { exact: true }).fill('離線收藏')
    await reopened.getByRole('button', { name: '儲存變更', exact: true }).click()
    await reopened.getByRole('button', { name: '關閉書籍資訊', exact: true }).click()
    await reopened.reload()
    await reopened.getByRole('searchbox', { name: '搜尋書籍' }).fill('離線收藏')
    await expect(
      reopened.getByRole('button', { name: '書籍資訊 離線改名', exact: true }),
    ).toBeVisible()
    await reopened.getByRole('button', { name: '書籍資訊 離線改名', exact: true }).click()
    await reopened.getByRole('button', { name: '開始閱讀', exact: true }).click()
    await expect(reopened.frameLocator('.epub-host iframe').locator('p').first()).toHaveCSS(
      'font-size',
      '21px',
    )
  } finally {
    if (!stopped) await stop()
  }
})
