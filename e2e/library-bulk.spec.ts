import { test, expect } from '@playwright/test'

test('fixed controls stay reachable while scrolling and batch actions affect only selected books', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toHaveCount(0)
  // Desktop automation does not emulate the physical iPhone inset; exercise a 34px inset explicitly.
  await page
    .locator('.app-shell')
    .evaluate((el) => (el as HTMLElement).style.setProperty('--bottom-safe', '34px'))
  await page.getByLabel('選擇書籍檔案').setInputFiles(
    Array.from({ length: 18 }, (_, i) => ({
      name: `${i < 2 ? '目標' : '其他'}${i}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`第一章\n測試書${i}`),
    })),
  )
  await expect(page.getByText('18 本書', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  const top = page.locator('.library-tools')
  const bottom = page.getByRole('toolbar', { name: '書庫操作' })
  const initialTop = (await top.boundingBox())!.y
  const initialBottom = (await bottom.boundingBox())!.y
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  expect((await top.boundingBox())!.y).toBe(initialTop)
  expect((await bottom.boundingBox())!.y).toBe(initialBottom)
  const lastCover = (await page.locator('.book-cover-wrap').last().boundingBox())!
  expect(lastCover.y + lastCover.height).toBeLessThan(initialBottom)
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 })
    for (const button of await bottom.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(56)
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.y + box.height).toBeLessThanOrEqual(852 - 34 - 14)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  await page.getByRole('searchbox', { name: '搜尋書籍' }).fill('目標')
  await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
  await expect(page.locator('.selection-count')).toContainText('2')
  await expect(page.locator('.book-card[aria-pressed="true"]')).toHaveCount(2)
  await page.getByRole('button', { name: '批次分類', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('目標0')
  await expect(page.getByRole('dialog')).not.toContainText('其他')
  await page.getByLabel('分類', { exact: true }).fill('收藏')
  await page.getByRole('button', { name: '套用分類', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '清除搜尋', exact: true }).click()
  await page.getByRole('combobox', { name: '分類篩選' }).selectOption('category:收藏')
  await expect(page.locator('.book-card')).toHaveCount(2)
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
  await page.getByRole('button', { name: '批次移除', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.book-card')).toHaveCount(2)
  await page.getByRole('button', { name: '批次移除', exact: true }).click()
  await page.getByRole('button', { name: '確認刪除 2 本', exact: true }).click()
  await expect(page.getByText('16 本書', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.book-card')).toHaveCount(16)
  await page.getByRole('searchbox', { name: '搜尋書籍' }).fill('目標')
  await expect(page.getByText('沒有符合的書籍', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(bottom).toHaveCount(0)
  await expect(top).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '設定', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await expect(top).toBeVisible()
  await expect(bottom).toBeVisible()
})
