// Private books remain in ignored local-books/ or artifacts/; never use them as CI fixtures.
import { chromium, webkit, devices, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const files = process.argv.slice(2)
if (!files.length) throw new Error('Provide local EPUB paths to test.')
await mkdir('artifacts/preview', { recursive: true })
for (const [name, browserType] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await browserType.launch()
  try {
    for (const [index, file] of files.entries()) {
      const context = await browser.newContext({ ...devices['iPhone 15'], deviceScaleFactor: 1 })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') console.log(name, 'console:', message.text().slice(0, 250))
      })
      await page.goto('http://127.0.0.1:4174/BookApp/')
      await page.getByLabel('選擇書籍檔案').setInputFiles(file)
      await expect(page.getByText('1 本書', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /^開啟 / }).click()
      await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
      const menu = page.getByRole('button', { name: '閱讀選單', exact: true })
      await expect(menu).toBeVisible({ timeout: 20000 })
      await expect(menu).not.toContainText('計算', { timeout: 30000 })
      await page.screenshot({ path: `artifacts/preview/local-epub-${index}-${name}-cover.png` })
      await menu.click()
      await page.getByRole('button', { name: '目錄', exact: true }).click()
      const chapters = page.getByRole('navigation', { name: '章節目錄' }).getByRole('button')
      const count = await chapters.count()
      expect(count).toBeGreaterThan(0)
      await chapters.nth(Math.min(5, count - 1)).click()
      await page.getByRole('button', { name: '下一頁', exact: true }).click()
      await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
      await expect(menu).toHaveText(/6[5-9]%|70%/, { timeout: 10000 })
      const before = await menu.textContent()
      await page.getByRole('button', { name: '閱讀排版' }).click()
      const panel = page.getByRole('dialog', { name: '排版', exact: true })
      for (let step = 0; step < 4; step++)
        await panel.getByRole('button', { name: '放大字級' }).click()
      await panel.getByRole('slider', { name: '行距', exact: true }).fill('2')
      await panel.getByRole('slider', { name: '左右邊距', exact: true }).fill('32')
      await panel.getByRole('button', { name: '深夜', exact: true }).click()
      await panel.getByRole('button', { name: '關閉排版' }).click()
      await expect(page.getByRole('button', { name: '返回書架' })).toBeEnabled({ timeout: 15000 })
      await expect(menu).toHaveText(before)
      const paragraph = page.frameLocator('.epub-host iframe').first().locator('p').first()
      await expect(paragraph).toHaveCSS('font-size', '24px')
      await expect(paragraph).toHaveCSS('color', 'rgb(227, 232, 221)')
      await page.getByRole('button', { name: '隱藏閱讀選單' }).click()
      await page.screenshot({ path: `artifacts/preview/local-epub-${index}-${name}-reading.png` })
      await menu.click()
      await page.getByRole('button', { name: '返回書架' }).click()
      await page.getByRole('button', { name: /^開啟 / }).click()
      await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
      await expect(menu).toHaveText(before)
      await expect(paragraph).toHaveCSS('font-size', '24px')
      await menu.click()
      await page.getByRole('button', { name: '返回書架' }).click()
      expect(errors).toEqual([])
      console.log(
        JSON.stringify({
          browser: name,
          fileIndex: index,
          tocEntries: count,
          restoredPercentage: before,
          errors,
        }),
      )
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
