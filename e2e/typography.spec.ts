import { test, expect, type Page } from '@playwright/test'
import { makeReadingEpub } from '../tests/fixtures/readingEpub.ts'

async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('kanshu-local')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const get = (store: string) =>
      new Promise<unknown>((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).openCursor()
        r.onsuccess = () => resolve(r.result?.value)
        r.onerror = () => reject(r.error)
      })
    try {
      return {
        progress: (await get('progress')) as { location: { cfi: string } },
        settings: (await get('readerSettings')) as {
          settings: { fontSize: number; theme: string; margin: number }
        },
      }
    } finally {
      db.close()
    }
  })
}
async function anchorVisible(page: Page, cfi: string) {
  // This fixture has simple element/text paths without ID assertions or CFI ranges.
  // Check actual glyph geometry, independently of the saved percentage/anchor.
  const match = cfi.match(/!((?:\/\d+)+):(\d+)\)/)
  if (!match) throw new Error(`Unexpected fixture CFI: ${cfi}`)
  return page.evaluate(
    ({ steps, offset }) => {
      const frame = document.querySelector<HTMLIFrameElement>('.epub-host iframe')!
      const doc = frame.contentDocument!
      let node: Node = doc.documentElement
      for (const step of steps) {
        const nodes = Array.from(node.childNodes).filter(
          (child) => child.nodeType === (step % 2 ? Node.TEXT_NODE : Node.ELEMENT_NODE),
        )
        node = nodes[step % 2 ? (step - 1) / 2 : step / 2 - 1]
      }
      const range = doc.createRange()
      const start = Math.min(offset, (node.textContent?.length ?? 1) - 1)
      range.setStart(node, start)
      range.setEnd(node, start + 1)
      const rect = range.getBoundingClientRect(),
        iframe = frame.getBoundingClientRect()
      const viewport = document.querySelector('.epub-host')!.getBoundingClientRect()
      const x = iframe.left + rect.left,
        y = iframe.top + rect.top
      return (
        x >= viewport.left - 2 && x < viewport.right && y >= viewport.top - 2 && y < viewport.bottom
      )
    },
    { steps: match[1].split('/').filter(Boolean).map(Number), offset: Number(match[2]) },
  )
}
test('live typography preserves its anchor across repeated reflows and offline reopening', async ({
  page,
  context,
  browserName,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await expect(page.getByText('可離線開啟 · 書籍需先下載')).toBeVisible()
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: 'layout.epub',
    mimeType: 'application/epub+zip',
    buffer: await makeReadingEpub(),
  })
  await page.getByRole('button', { name: '書籍資訊 午後的書頁' }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  const menu = page.getByRole('button', { name: '閱讀選單', exact: true })
  // The tap zones are shown once on the first open, then fade on their own.
  await expect(page.locator('.tap-zone-hint')).toBeVisible()
  await expect(page.locator('.tap-zone-hint')).toHaveCount(0, { timeout: 5000 })
  await expect(menu).not.toContainText('計算')
  await menu.click()
  await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
  await expect(menu).toHaveText(/6[5-9]%|70%/)
  await expect(page.getByRole('button', { name: '返回書架' })).toBeEnabled()
  const before = (await stored(page)).progress.location.cfi
  await page.getByRole('button', { name: '閱讀排版' }).click()
  const panel = page.getByRole('dialog', { name: '排版', exact: true })
  for (let i = 0; i < 6; i++) await panel.getByRole('button', { name: '放大字級' }).click()
  await panel.getByRole('combobox', { name: '字體' }).selectOption('sans')
  await panel.getByRole('slider', { name: '行距', exact: true }).fill('2.2')
  await panel.getByRole('slider', { name: '段落間距', exact: true }).fill('1.4')
  await panel.getByRole('slider', { name: '左右邊距', exact: true }).fill('38')
  await panel.getByRole('button', { name: '深夜', exact: true }).click()
  await panel.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(panel.getByRole('button', { name: '關閉', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(panel.getByRole('status', { name: '目前字級' })).toHaveText('26')
  await expect.poll(async () => (await stored(page)).settings?.settings.fontSize).toBe(26)
  await panel.getByRole('button', { name: '關閉排版' }).click()
  await expect(page.getByRole('button', { name: '返回書架' })).toBeEnabled({ timeout: 15000 })
  const paragraph = page.frameLocator('.epub-host iframe').first().locator('p').first()
  await expect(paragraph).toHaveCSS('font-size', '26px')
  await expect
    .poll(() => paragraph.evaluate((p) => parseFloat(getComputedStyle(p).lineHeight)))
    .toBeCloseTo(57.2, 3)
  await expect(paragraph).toHaveCSS('color', 'rgb(227, 232, 221)')
  await expect(page.locator('.epub-host')).toHaveCSS('left', '38px')
  expect((await stored(page)).progress.location.cfi).toBe(before)
  await expect.poll(() => anchorVisible(page, before)).toBe(true)
  await page.getByRole('button', { name: '閱讀排版' }).click()
  await page.screenshot({ path: `artifacts/preview/typography-${browserName}.png` })
  await panel.getByLabel('文字顏色', { exact: true }).fill('#d9e8ff')
  await panel.getByLabel('背景顏色', { exact: true }).fill('#18202c')
  await panel.getByRole('button', { name: '關閉排版' }).click()
  await expect(page.getByRole('button', { name: '返回書架' })).toBeEnabled()
  await expect(paragraph).toHaveCSS('color', 'rgb(217, 232, 255)')
  expect((await stored(page)).progress.location.cfi).toBe(before)
  await page.getByRole('button', { name: '返回書架' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper')
  if (browserName === 'chromium') await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: '書籍資訊 午後的書頁' }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await expect(menu).toBeVisible()
  await expect(paragraph).toHaveCSS('font-size', '26px')
  await expect(paragraph).toHaveCSS('color', 'rgb(217, 232, 255)')
  await expect.poll(async () => (await stored(page)).progress.location.cfi).toBe(before)
  await expect.poll(() => anchorVisible(page, before)).toBe(true)
  await menu.click()
  const frame = page.locator('.epub-host iframe').first()
  const beforePage = await frame.evaluate((element) => element.getBoundingClientRect().left)
  await page.getByRole('button', { name: '下一頁', exact: true }).click()
  await expect
    .poll(() => frame.evaluate((element) => element.getBoundingClientRect().left))
    .not.toBe(beforePage)
  // A reflow anchor can sit near the end of its new page; advance again to ensure
  // the saved anchor follows navigation instead of remaining pinned indefinitely.
  await page.getByRole('button', { name: '下一頁', exact: true }).click()
  await expect.poll(async () => (await stored(page)).progress.location.cfi).not.toBe(before)
  await expect(page.getByRole('button', { name: '下一頁', exact: true })).toBeEnabled()
  const afterTurn = (await stored(page)).progress.location.cfi
  await page.getByRole('button', { name: '閱讀排版' }).click()
  await panel.getByRole('button', { name: '重設排版' }).click()
  await panel.getByRole('button', { name: '關閉排版' }).click()
  await expect(page.getByRole('button', { name: '返回書架' })).toBeEnabled()
  await expect(paragraph).toHaveCSS('font-size', '20px')
  await expect(page.locator('.epub-host')).toHaveCSS('left', '24px')
  expect((await stored(page)).progress.location.cfi).toBe(afterTurn)
  await expect.poll(() => anchorVisible(page, afterTurn)).toBe(true)
  await page.getByRole('button', { name: '返回書架' }).click()
  expect(errors).toEqual([])
})
