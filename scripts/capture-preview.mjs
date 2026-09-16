import { chromium, devices, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { makeEpub } from '../tests/fixtures/epub.ts'

const output = 'artifacts/preview'
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    ...devices['iPhone 15'],
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4174/BookApp/')
  await page.getByText('可離線開啟 · 書籍需先下載').waitFor()
  await page.screenshot({ path: `${output}/library-iphone.png` })
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: /^加入主畫面/ }).click()
  await page.screenshot({ path: `${output}/install-iphone.png` })
  await page.getByRole('button', { name: '知道了' }).click()
  await page.screenshot({ path: `${output}/settings-iphone.png`, fullPage: true })
  for (const [id, name] of [
    ['graphite', '工程師深灰'],
    ['mist', '霧藍'],
    ['sage', '鼠尾草綠'],
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name, exact: true })).toBeEnabled()
    await expect(page.locator('html')).toHaveAttribute('data-theme', id)
    await page.screenshot({ path: `${output}/${id}-iphone.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '深夜', exact: false }).click()
  await page.screenshot({ path: `${output}/dark-iphone.png`, fullPage: true })
  await page.getByRole('button', { name: '暖紙', exact: false }).click()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  const sample = Buffer.from(await makeEpub({ cover: false, author: '看書・原創測試內容' }))
  await mkdir('artifacts/examples', { recursive: true })
  await writeFile('artifacts/examples/sample.epub', sample)
  await page.getByLabel('選擇書籍檔案').setInputFiles([
    { name: 'sample.epub', mimeType: 'application/epub+zip', buffer: sample },
    {
      name: '山城來信（測試）.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一章\n' + '走過山城，聽見風的聲音。\n'.repeat(300)),
    },
    {
      name: '慢慢走的日子（測試）.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一回\n把步伐放慢，給故事一點時間。'),
    },
    ...['雨', '在城市邊緣慢慢散步的很長書名（測試）', '凌晨的車站'].map((name) => ({
      name: `${name}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`第一章\n${name}，一段原創測試文字。`),
    })),
  ])
  await page.getByText('6 本書', { exact: true }).waitFor()
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `${output}/imported-library-iphone.png` })
  await page.getByRole('button', { name: '開啟 午後的書頁' }).click()
  await page.screenshot({ path: `${output}/book-details-iphone.png` })
  await page.getByRole('button', { name: '編輯書籍資訊', exact: true }).click()
  await page.screenshot({ path: `${output}/book-edit-iphone.png` })
  await page.getByLabel('分類', { exact: true }).fill('小說')
  await page.getByRole('button', { name: '儲存變更', exact: true }).click()
  await page.getByRole('button', { name: '關閉書籍資訊', exact: true }).click()
  await page.getByRole('button', { name: '開啟 山城來信（測試）', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await page.getByRole('button', { name: '閱讀選單', exact: true }).click()
  await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
  await page
    .getByRole('button', { name: '閱讀選單', exact: true })
    .filter({ hasText: '68%' })
    .waitFor()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `${output}/compact-library-iphone.png` })
  console.log(
    await page.evaluate(() => {
      const navTop = document.querySelector('.library-actions').getBoundingClientRect().top
      return {
        visibleCovers: [...document.querySelectorAll('.book-grid .book-cover')].filter(
          (el) => el.getBoundingClientRect().bottom <= navTop,
        ).length,
        infoButtons: document.querySelectorAll('.book-info-button').length,
      }
    }),
  )
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
  await page.screenshot({ path: `${output}/bulk-selection-iphone.png` })
  await page.getByRole('button', { name: '批次分類', exact: true }).click()
  await page.screenshot({ path: `${output}/bulk-category-iphone.png` })
  await context.close()
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await desktop.goto('http://127.0.0.1:4174/BookApp/')
  await desktop.getByText('可離線開啟 · 書籍需先下載').waitFor()
  await desktop.screenshot({ path: `${output}/library-desktop.png`, fullPage: true })
} finally {
  await browser.close()
}
