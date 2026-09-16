import { expect, test } from '@playwright/test'

test('TXT search, bookmarks, jump history and vertical tap zones persist content positions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  const content = `第一章 起點\n${'前段內容。'.repeat(1200)}\n第二章 遠方\n唯一搜尋目標句子\n${'後段內容。'.repeat(600)}`
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: '工具測試.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  })
  await expect(page.getByText('1 本書', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  await page.getByRole('button', { name: '開啟 工具測試', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  const menu = page.getByRole('button', { name: '閱讀選單', exact: true })
  await expect(menu).toBeVisible()
  const original = Number(await page.locator('.text-host').getAttribute('data-start'))
  await menu.click()

  await page.getByRole('button', { name: '書籤', exact: true }).click()
  await page.getByRole('button', { name: '搜尋', exact: true }).click()
  const tools = page.getByRole('dialog', { name: '搜尋與書籤' })
  await expect(tools.getByRole('heading', { name: '書籤 · 1' })).toBeVisible()
  await tools.getByRole('searchbox', { name: '搜尋書內文字' }).fill('唯一搜尋目標句子')
  await tools.getByRole('button', { name: '搜尋', exact: true }).click()
  await tools
    .getByText(/唯一搜尋目標句子/)
    .last()
    .click()
  await expect(page.locator('.text-host')).not.toHaveAttribute('data-start', String(original))
  await page.getByRole('button', { name: '返回跳轉前位置' }).click()
  await expect(page.locator('.text-host')).toHaveAttribute('data-start', String(original))

  await page.getByRole('button', { name: '閱讀排版' }).click()
  const vertical = page.getByRole('button', { name: '上下', exact: true })
  await vertical.click()
  await expect(vertical).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '關閉排版' }).click()
  await page.getByRole('button', { name: '搜尋', exact: true }).click()
  await expect(page.getByRole('heading', { name: '書籤 · 1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /跳轉足跡/ })).toBeVisible()
})
