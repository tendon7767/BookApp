import { expect, test } from '@playwright/test'

test('TXT reader keeps search, reading controls, and vertical tap zones', async ({ page }) => {
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
  await page.getByRole('button', { name: '書籍資訊 工具測試', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  const menu = page.getByRole('button', { name: '閱讀選單', exact: true })
  await expect(menu).toBeVisible()
  const original = Number(await page.locator('.text-host').getAttribute('data-start'))
  await menu.click()

  const controls = page.locator('footer.reader-controls')
  await expect(controls.locator('.reader-actions button')).toHaveCount(3)
  await expect(controls.locator('.reader-actions button').nth(0)).toHaveAccessibleName('閱讀排版')
  await expect(controls.locator('.reader-actions button').nth(1)).toHaveAccessibleName('目錄')
  await expect(controls.locator('.reader-actions button').nth(2)).toHaveAccessibleName('搜尋')
  const previous = controls.getByRole('button', { name: '上一頁' })
  const next = controls.getByRole('button', { name: '下一頁' })
  const progress = controls.getByRole('slider', { name: '閱讀進度' })
  const back = controls.getByRole('button', { name: '返回書架' })
  await expect(previous).toHaveText('')
  await expect(next).toHaveText('')
  const [previousBox, progressBox, nextBox, backBox] = await Promise.all([
    previous.boundingBox(),
    progress.boundingBox(),
    next.boundingBox(),
    back.boundingBox(),
  ])
  expect(previousBox!.x + previousBox!.width).toBeLessThan(progressBox!.x)
  expect(progressBox!.x + progressBox!.width).toBeLessThan(nextBox!.x)
  expect(backBox!.y).toBeGreaterThan(nextBox!.y)
  await expect(back).toHaveClass(/secondary-button/)
  await expect(
    page.locator('.reader-toolbar').getByRole('button', { name: '返回書架' }),
  ).toHaveCount(0)
  await expect(controls.getByText(/左右點按|上下點按/)).toHaveCount(0)
  await page.getByRole('button', { name: '搜尋', exact: true }).click()
  const tools = page.getByRole('dialog', { name: '搜尋' })
  await expect(tools.getByText(/書籤|跳轉足跡/)).toHaveCount(0)
  await tools.getByRole('searchbox', { name: '搜尋書內文字' }).fill('唯一搜尋目標句子')
  await tools.getByRole('button', { name: '搜尋', exact: true }).click()
  await tools
    .getByText(/唯一搜尋目標句子/)
    .last()
    .click()
  await expect(page.locator('.text-host')).not.toHaveAttribute('data-start', String(original))
  await expect(page.getByRole('button', { name: '返回跳轉前位置' })).toHaveCount(0)

  await page.getByRole('button', { name: '閱讀排版' }).click()
  const vertical = page.getByRole('button', { name: '上下', exact: true })
  await vertical.click()
  await expect(vertical).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '關閉排版' }).click()
  await page.getByRole('button', { name: '搜尋', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '搜尋' }).getByText(/書籤|跳轉足跡/)).toHaveCount(0)
  await page.getByRole('button', { name: '關閉', exact: true }).click()
  await back.click()
  await expect(page.getByRole('searchbox', { name: '搜尋書籍' })).toBeVisible()
})
