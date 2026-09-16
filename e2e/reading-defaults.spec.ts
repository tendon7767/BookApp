import { test, expect, type Page } from '@playwright/test'
import { makeEpub } from '../tests/fixtures/epub.ts'

async function openBook(page: Page, title: string) {
  await page.getByRole('button', { name: `開啟 ${title}`, exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await page.getByRole('button', { name: '閱讀選單', exact: true }).click()
}
async function defaults(page: Page) {
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: /^預設排版/ }).click()
}

test('shared defaults persist, do not freeze on reading, and respect custom book settings', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await defaults(page)
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '放大字級' }).click()
  await page.getByRole('combobox', { name: '字體', exact: true }).selectOption('sans')
  await page.screenshot({ path: testInfo.outputPath('reading-defaults.png') })
  // A failed write retains the draft and allows retry.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'preferences') {
        IDBObjectStore.prototype.put = original
        throw new DOMException('Full', 'QuotaExceededError')
      }
      return original.apply(this, args)
    }
  })
  await page.getByRole('button', { name: '儲存預設排版' }).click()
  await expect(page.getByRole('alert')).toContainText('未能儲存')
  await expect(page.getByLabel('目前字級')).toHaveText('24')
  await page.getByRole('button', { name: '儲存預設排版' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await page.getByLabel('選擇書籍檔案').setInputFiles([
    {
      name: '文字.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一章\n窗邊的故事。'.repeat(150)),
    },
    {
      name: 'epub.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(await makeEpub({ title: '預設測試' })),
    },
  ])
  await expect(page.getByText('2 本書', { exact: true })).toBeVisible()
  await openBook(page, '文字')
  await expect(page.locator('.text-page')).toHaveCSS('font-size', '24px')
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await defaults(page)
  await page.getByRole('button', { name: '放大字級' }).click()
  await page.getByRole('button', { name: '儲存預設排版' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await openBook(page, '文字')
  await expect(page.locator('.text-page')).toHaveCSS('font-size', '25px')
  await page.getByRole('button', { name: '閱讀排版' }).click()
  await page.getByRole('button', { name: '放大字級' }).click()
  await page.getByRole('button', { name: '關閉排版' }).click()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await openBook(page, '預設測試')
  await expect(page.frameLocator('.epub-host iframe').locator('p').first()).toHaveCSS(
    'font-size',
    '25px',
  )
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await defaults(page)
  await page.getByRole('button', { name: '縮小字級' }).click()
  await page.getByRole('button', { name: '儲存預設排版' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await openBook(page, '預設測試')
  await expect(page.frameLocator('.epub-host iframe').locator('p').first()).toHaveCSS(
    'font-size',
    '24px',
  )
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await openBook(page, '文字')
  await expect(page.locator('.text-page')).toHaveCSS('font-size', '26px')
})
