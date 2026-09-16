// User-provided books stay in ignored artifacts/; only statistics are printed.
import { chromium, webkit, devices, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const file = process.argv[2]
if (!file) throw new Error('Provide a local TXT path.')
await mkdir('artifacts/preview', { recursive: true })
for (const [name, browserType] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await browserType.launch()
  try {
    const context = await browser.newContext({ ...devices['iPhone 15'], deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:4174/BookApp/')
    await page.getByLabel('選擇書籍檔案').setInputFiles(file)
    await expect(page.getByText('1 本書', { exact: true })).toBeVisible()
    const start = performance.now()
    await page.getByRole('button', { name: /^開啟 / }).click()
    await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
    const menu = page.getByRole('button', { name: '閱讀選單', exact: true })
    await expect(menu).toBeVisible({ timeout: 20000 })
    const openMs = Math.round(performance.now() - start)
    await menu.click()
    const encoding = await page
      .getByRole('combobox', { name: 'TXT 編碼' })
      .locator('option:checked')
      .textContent()
    await page.getByRole('button', { name: '目錄', exact: true }).click()
    const chapters = page.getByRole('navigation', { name: '章節目錄' }).getByRole('button')
    const count = await chapters.count()
    expect(count).toBeGreaterThan(0)
    await chapters.nth(Math.min(5, count - 1)).click()
    const next = page.getByRole('button', { name: '下一頁', exact: true })
    for (let i = 0; i < 10; i++) {
      await next.click()
      await expect(next).toBeEnabled()
    }
    await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
    await expect(menu).toHaveText('68%')
    const anchor = await page.locator('.text-host').getAttribute('data-start')
    await page.getByRole('button', { name: '閱讀排版' }).click()
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '放大字級' }).click()
    await page.getByRole('button', { name: '深夜', exact: true }).click()
    await page.getByRole('button', { name: '關閉排版' }).click()
    await expect(next).toBeEnabled()
    await expect(page.locator('.text-host')).toHaveAttribute('data-start', anchor)
    await expect(page.locator('.text-page')).toHaveCSS('font-size', '24px')
    await page.getByRole('button', { name: '隱藏閱讀選單' }).click()
    await page.screenshot({ path: `artifacts/preview/local-text-${name}.png` })
    await menu.click()
    await page.getByRole('button', { name: '返回書架' }).click()
    await page.getByRole('button', { name: /^開啟 / }).click()
    await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
    await expect(menu).toHaveText('68%')
    await expect(page.locator('.text-host')).toHaveAttribute('data-start', anchor)
    await expect(page.locator('.text-page')).toHaveCSS('font-size', '24px')
    expect(errors).toEqual([])
    console.log(
      JSON.stringify({
        browser: name,
        encoding,
        tocEntries: count,
        openMs,
        restoredPercentage: '68%',
        errors,
      }),
    )
    await context.close()
  } finally {
    await browser.close()
  }
}
