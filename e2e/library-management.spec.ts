import { test, expect } from '@playwright/test'

test('edits, searches, filters and resumes recently read books without losing progress', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles(
    ['故事2', '故事10', '其他'].map((name) => ({
      name: `${name}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`第一章 ${name}\n` + '窗邊的故事，等待下一頁的旅人。\n'.repeat(300)),
    })),
  )
  await expect(page.getByText('3 本書', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '書籍資訊 故事2', exact: true }).click()
  await page.getByRole('button', { name: '編輯書籍資訊', exact: true }).click()
  await page.getByRole('textbox', { name: '書名', exact: true }).fill('  山城夜讀  ')
  await page.getByRole('textbox', { name: '作者', exact: true }).fill('測試作者')
  await page.getByLabel('分類', { exact: true }).fill('小說')
  await page.getByRole('button', { name: '儲存變更', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('山城夜讀')
  // The file name now lives in the collapsible details block.
  await page.getByText('原始檔案', { exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('故事2.txt')
  await page.getByRole('button', { name: '關閉書籍資訊', exact: true }).click()
  const search = page.getByRole('searchbox', { name: '搜尋書籍' })
  await search.fill('故事2 測試作者')
  await expect(page.getByText('找到 1 本書')).toBeVisible()
  const card = page.getByRole('button', { name: '書籍資訊 山城夜讀', exact: true })
  await expect(card.locator('.book-cover-progress')).toHaveAttribute('aria-label', '尚未閱讀')
  await page.getByRole('combobox', { name: '分類篩選' }).selectOption('category:小說')
  await card.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.text-page')).toHaveCount(0)
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await page.getByRole('button', { name: '閱讀選單', exact: true }).click()
  await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
  await expect(page.getByRole('button', { name: '閱讀選單', exact: true })).toHaveText('68%')
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await expect(search).toHaveValue('故事2 測試作者')
  await expect(card.locator('.book-cover-progress')).toHaveAttribute('aria-label', '已讀 68%')
  await page.getByRole('button', { name: '清除搜尋', exact: true }).click()
  await page.getByRole('combobox', { name: '分類篩選' }).selectOption('all')
  await expect(page.locator('.book-card').first()).toHaveAttribute(
    'aria-label',
    '書籍資訊 山城夜讀',
  )
  await page.reload()
  await expect(page.locator('.book-card').first()).toHaveAttribute(
    'aria-label',
    '書籍資訊 山城夜讀',
  )
  await expect(card.locator('.book-cover-progress')).toHaveAttribute('aria-label', '已讀 68%')
  await search.fill('找不到的書')
  await expect(page.getByText('沒有符合的書籍', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '清除篩選', exact: true }).click()
  await page.getByRole('combobox', { name: '分類篩選' }).selectOption('uncategorized')
  await expect(page.locator('.book-card')).toHaveCount(2)
  await page.getByRole('combobox', { name: '分類篩選' }).selectOption('category:小說')
  await page.getByRole('button', { name: '書籍資訊 山城夜讀', exact: true }).click()
  // The progress row now carries the percentage and the timestamp.
  await expect(page.getByRole('dialog')).toContainText('已讀 68%')
  await expect(page.getByRole('dialog').locator('time')).toBeVisible()
  await page.getByRole('button', { name: '編輯書籍資訊', exact: true }).click()
  await page.getByLabel('分類', { exact: true }).fill('')
  await page.getByRole('button', { name: '儲存變更', exact: true }).click()
  await page.getByRole('button', { name: '關閉書籍資訊', exact: true }).click()
  await expect(page.getByText('沒有符合的書籍', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '清除篩選', exact: true }).click()
  await expect(card.locator('.book-cover-progress')).toHaveAttribute('aria-label', '已讀 68%')
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `artifacts/preview/library-management-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test('blank names are rejected and a failed save keeps editable values for retry', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: '原書名.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章\n離線也能看書。'),
  })
  await page.getByRole('button', { name: '書籍資訊 原書名', exact: true }).click()
  await page.getByRole('button', { name: '編輯書籍資訊', exact: true }).click()
  const title = page.getByRole('textbox', { name: '書名', exact: true })
  await title.fill('   ')
  await expect(page.getByRole('button', { name: '儲存變更', exact: true })).toBeDisabled()
  await title.fill('新的書名')
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'books') {
        IDBObjectStore.prototype.put = original
        throw new DOMException('Storage unavailable', 'QuotaExceededError')
      }
      return original.apply(this, args)
    }
  })
  await page.getByRole('button', { name: '儲存變更', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(title).toHaveValue('新的書名')
  await expect(
    page.getByRole('button', { name: '書籍資訊 原書名', exact: true, includeHidden: true }),
  ).toBeAttached()
  await page.getByRole('button', { name: '儲存變更', exact: true }).click()
  await page.getByRole('button', { name: '關閉書籍資訊', exact: true }).click()
  await expect(page.getByRole('button', { name: '書籍資訊 新的書名', exact: true })).toBeVisible()
})
