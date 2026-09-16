import { test, expect } from '@playwright/test'
import { preview } from 'vite'

test('series can be assigned in bulk, searched, ordered, edited and read offline', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 })
  const server = await preview({ preview: { host: 'localhost', port: 0, strictPort: true } })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('No server address')
  const url = 'http://localhost:' + address.port + '/BookApp/'
  const stop = () =>
    new Promise<void>((resolve, reject) => {
      if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections()
      server.httpServer.close((e) => (e ? reject(e) : resolve()))
    })
  let stopped = false
  try {
    await page.goto(url)
    await expect(page.getByText('可離線開啟 · 書籍需先下載')).toBeVisible()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await page.getByLabel('選擇書籍檔案').setInputFiles(
      ['序曲', '遠行', '番外', '散文'].map((name, i) => ({
        name: `${name}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(`第一章\n${name}\n` + `故事${i}繼續。`.repeat(400)),
      })),
    )
    await expect(page.getByText('4 本書', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '關閉匯入結果' }).click()
    await page.getByRole('button', { name: '批次編輯', exact: true }).click()
    for (const title of ['序曲', '遠行', '番外'])
      await page.getByRole('button', { name: `選取 ${title}`, exact: true }).click()
    await page.getByRole('button', { name: '設定系列', exact: true }).click()
    await page.getByLabel('系列', { exact: true }).fill('山城故事')
    await page.getByLabel('序曲 集數', { exact: true }).fill('2')
    await page.getByLabel('遠行 集數', { exact: true }).fill('10')
    await page.screenshot({ path: testInfo.outputPath('series-editor.png') })
    await page.getByRole('button', { name: '套用系列', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.book-card')).toHaveCount(2)
    await expect(page.locator('.series-badge')).toHaveText('3 本')
    await page.reload()
    await expect(page.getByRole('button', { name: '開啟系列 山城故事', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('series-shelf.png') })
    await page.getByRole('searchbox', { name: '搜尋書籍' }).fill('遠行')
    await expect(page.locator('.series-badge')).toHaveText('1/3 本符合')
    await page.getByRole('button', { name: '開啟系列 山城故事', exact: true }).click()
    await expect(page.locator('.book-card')).toHaveCount(1)
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click()
    await expect(page.locator('.book-card-title')).toHaveText(['序曲', '遠行', '番外'])
    await page.getByRole('button', { name: '開啟 序曲', exact: true }).click()
    await page.getByRole('button', { name: '編輯書籍資訊', exact: true }).click()
    await expect(page.getByLabel('系列', { exact: true })).toHaveValue('山城故事')
    await page.getByLabel('集數', { exact: true }).fill('1')
    await page.getByRole('button', { name: '儲存變更', exact: true }).click()
    await page.getByRole('button', { name: '關閉書籍資訊', exact: true }).click()
    await stop()
    stopped = true
    await page.getByRole('button', { name: '開啟 序曲', exact: true }).click()
    await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
    await expect(page.locator('.text-page')).toBeVisible()
    // Reveal controls through the reader's accessible menu.
    await page.getByRole('button', { name: '閱讀選單', exact: true }).click()
    await page.getByRole('button', { name: '返回書架', exact: true }).click()
    await expect(page.locator('.series-heading')).toContainText('山城故事')
    await expect(page.locator('.book-card').first()).not.toContainText('上次閱讀')
    await page.screenshot({ path: testInfo.outputPath('series-volumes.png') })
    await page.getByRole('button', { name: '返回全部書籍', exact: true }).click()
    await page.getByRole('searchbox', { name: '搜尋書籍' }).fill('山城故事')
    await page.getByRole('button', { name: '批次編輯', exact: true }).click()
    await expect(page.locator('.book-card')).toHaveCount(3)
    await page.setViewportSize({ width: 320, height: 700 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
    await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
    await page.getByRole('button', { name: '設定系列', exact: true }).click()
    await page.getByLabel('系列', { exact: true }).fill('')
    await page.getByRole('button', { name: '套用系列', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click()
    await expect(page.locator('.series-card')).toHaveCount(0)
    await expect(page.locator('.book-card')).toHaveCount(4)
  } finally {
    if (!stopped) await stop()
  }
})

test('series suggestions are reviewable, cancelable and preserve later manual edits', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles(
    ['山城故事 第十二集', '山城故事 第十三集'].map((name) => ({
      name: name + '.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('第一章\n' + name),
    })),
  )
  await expect(page.getByText('2 本書', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '關閉匯入結果' }).click()
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
  await page.getByRole('button', { name: '設定系列', exact: true }).click()
  await expect(page.getByLabel('系列', { exact: true })).toHaveValue('山城故事 第十')
  await expect(page.getByLabel('山城故事 第十二集 集數', { exact: true })).toHaveValue('12')
  await expect(page.getByLabel('山城故事 第十三集 集數', { exact: true })).toHaveValue('13')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '結束選取', exact: true }).click()
  await expect(page.locator('.series-card')).toHaveCount(0)
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
  await page.getByRole('button', { name: '設定系列', exact: true }).click()
  await page.getByLabel('系列', { exact: true }).fill('我的山城')
  await page.getByLabel('山城故事 第十二集 集數', { exact: true }).fill('1')
  await page.getByRole('button', { name: '套用系列', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '開啟系列 我的山城', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '批次編輯', exact: true }).click()
  await page.getByRole('button', { name: '全選目前結果', exact: true }).click()
  await page.getByRole('button', { name: '設定系列', exact: true }).click()
  await expect(page.getByLabel('系列', { exact: true })).toHaveValue('我的山城')
  await expect(page.getByLabel('山城故事 第十二集 集數', { exact: true })).toHaveValue('1')
})
