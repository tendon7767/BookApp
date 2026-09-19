import { expect, test } from '@playwright/test'

test('mobile back from settings returns to the shelf', async ({ page }) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('region', { name: '書架' })).toBeVisible()
  expect(page.url()).not.toContain('entry=before')

  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await expect(page.getByRole('region', { name: '書架' })).toBeVisible()
  await page.goBack()
  expect(page.url()).toContain('entry=before')
})

test('mobile back from a series or its reader returns to the shelf', async ({ page }) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles(
    ['序曲', '續篇'].map((name) => ({
      name: `${name}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`第一章 ${name}\n` + '往下一頁。'.repeat(200)),
    })),
  )
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  for (const title of ['序曲', '續篇'])
    await page.getByRole('button', { name: `選取 ${title}`, exact: true }).click()
  await page.getByRole('button', { name: '設定系列', exact: true }).click()
  await page.getByLabel('系列', { exact: true }).fill('旅程')
  await page.getByRole('button', { name: '套用系列', exact: true }).click()

  const series = page.getByRole('button', { name: '開啟系列 旅程', exact: true })
  await series.click()
  await expect(page.locator('.series-heading')).toContainText('旅程')
  await page.goBack()
  await expect(series).toBeVisible()
  await expect(page.locator('.series-heading')).toHaveCount(0)
  expect(page.url()).not.toContain('entry=before')

  await series.click()
  await page.getByRole('button', { name: '返回全部書籍', exact: true }).click()
  await expect(series).toBeVisible()
  await series.click()
  await page.getByRole('button', { name: '閱讀 序曲', exact: true }).click()
  await expect(page.locator('.text-page')).toBeVisible()
  await page.goBack()
  await expect(series).toBeVisible()
  await expect(page.locator('.series-heading')).toHaveCount(0)
  expect(page.url()).not.toContain('entry=before')

  await series.click()
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  for (const title of ['序曲', '續篇'])
    await page.getByRole('button', { name: `選取 ${title}`, exact: true }).click()
  await page.getByRole('button', { name: '設定系列', exact: true }).click()
  await page.getByLabel('系列', { exact: true }).fill('新旅程')
  await page.getByRole('button', { name: '套用系列', exact: true }).click()
  await expect(page.locator('.series-heading')).toContainText('新旅程')
  await page.goBack()
  await expect(page.getByRole('button', { name: '開啟系列 新旅程' })).toBeVisible()
  await expect(page.locator('.series-heading')).toHaveCount(0)
})

test('mobile back from the reader returns to the shelf', async ({ page }) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: '返回測試.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章\n' + '閱讀中。'.repeat(300)),
  })
  const book = page.getByRole('button', { name: '書籍資訊 返回測試', exact: true })
  await book.click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await expect(page.locator('.text-page')).toBeVisible()
  await page.goBack()
  await expect(book).toBeVisible()
  expect(page.url()).not.toContain('entry=before')

  await book.click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await page.getByRole('button', { name: '閱讀選單' }).click()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await expect(book).toBeVisible()
  await page.goBack()
  expect(page.url()).toContain('entry=before')
})

test('mobile back closes settings sheets and returns from subpages to settings', async ({
  page,
}) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByRole('button', { name: '設定', exact: true }).click()

  await page.getByRole('button', { name: /預設排版/ }).click()
  await expect(page.getByRole('dialog', { name: '預設排版' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '預設排版' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()

  await page.getByRole('button', { name: /儲存空間與下載/ }).click()
  await expect(page.getByRole('region', { name: '儲存空間' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()

  await page.getByRole('button', { name: /Google Drive/ }).click()
  await expect(page.getByRole('region', { name: '雲端同步' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()

  await page.getByRole('button', { name: /加入主畫面/ }).click()
  await expect(page.getByRole('dialog', { name: '加入主畫面' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '加入主畫面' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()
  await page.getByRole('button', { name: /預設排版/ }).click()
  await page.getByRole('button', { name: '關閉排版' }).click()
  await page.getByRole('button', { name: /儲存空間與下載/ }).click()
  await page.goBack()
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await expect(page.getByRole('region', { name: '書架' })).toBeVisible()
  await page.goBack()
  expect(page.url()).toContain('entry=before')
})

test('subpage return button skips settings and goes straight to the shelf', async ({ page }) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: /儲存空間與下載/ }).click()
  await page.getByRole('button', { name: '返回書架', exact: true }).click()
  await expect(page.getByRole('region', { name: '書架' })).toBeVisible()
  await page.goBack()
  expect(page.url()).toContain('entry=before')
})

test('mobile back closes book details, edit, removal, and batch selection one layer at a time', async ({
  page,
}) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: '返回層級.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章\n' + '閱讀中。'.repeat(200)),
  })
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  const book = page.getByRole('button', { name: '書籍資訊 返回層級', exact: true })
  await book.click()
  await page.getByRole('button', { name: '編輯書籍資訊' }).click()
  await page.goBack()
  await expect(page.getByRole('button', { name: '開始閱讀' })).toBeVisible()
  await page.getByRole('button', { name: '刪除書籍' }).click()
  await expect(page.getByRole('dialog', { name: '刪除書籍' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '刪除書籍' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '開始閱讀' })).toBeVisible()
  await page.goBack()
  await expect(book).toBeVisible()

  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  await page.getByRole('button', { name: '選取 返回層級', exact: true }).click()
  await page.getByRole('button', { name: '批次分類', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '批次分類' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '批次分類' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '結束選取' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('button', { name: '批次編輯', exact: true })).toBeVisible()
  expect(page.url()).not.toContain('entry=before')
})

test('mobile back closes reader tools before returning to the shelf', async ({ page }) => {
  await page.goto('./?entry=before')
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: '閱讀層級.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章\n' + '閱讀中。'.repeat(300)),
  })
  await page.getByRole('button', { name: '書籍資訊 閱讀層級', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await page.getByRole('button', { name: '閱讀選單' }).click()

  await page.getByRole('button', { name: '目錄', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '目錄' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '目錄' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '搜尋', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '搜尋', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '搜尋' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '搜尋' })).toHaveCount(0)

  await page.getByRole('button', { name: '閱讀排版' }).click()
  await expect(page.getByRole('dialog', { name: '排版' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '排版' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '返回書架' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('region', { name: '書架' })).toBeVisible()
  expect(page.url()).not.toContain('entry=before')
})

test('closing nested dialogs does not dismiss the next book opened immediately', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles(
    ['刪除這本', '保留這本'].map((title) => ({
      name: `${title}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`第一章 ${title}\n` + '下一頁。'.repeat(100)),
    })),
  )
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  await page.getByRole('button', { name: '書籍資訊 刪除這本', exact: true }).click()
  await page.getByRole('button', { name: '刪除書籍' }).click()
  await page.getByRole('button', { name: '確認刪除 1 本', exact: true }).click()
  await page.getByRole('button', { name: '書籍資訊 保留這本', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /保留這本/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '開始閱讀' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('region', { name: '書架' })).toBeVisible()
})
