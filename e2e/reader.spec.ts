import { test, expect, type Page } from '@playwright/test'
import { makeReadingEpub } from '../tests/fixtures/readingEpub.ts'

async function progress(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('kanshu-local')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    try {
      return await new Promise<{ location: { cfi: string }; percentage: number } | null>(
        (resolve, reject) => {
          const r = db.transaction('progress').objectStore('progress').openCursor()
          r.onsuccess = () => resolve(r.result?.value ?? null)
          r.onerror = () => reject(r.error)
        },
      )
    } finally {
      db.close()
    }
  })
}

for (const version of ['2.0', '3.0'] as const) {
  test(`EPUB ${version} paginates, jumps via TOC/slider and restores its CFI offline`, async ({
    page,
    context,
    browserName,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('./')
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready')
    await page.getByLabel('選擇書籍檔案').setInputFiles({
      name: 'reading.epub',
      mimeType: 'application/epub+zip',
      buffer: await makeReadingEpub(version),
    })
    await page.getByRole('button', { name: '書籍資訊 午後的書頁', exact: true }).click()
    await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
    const menu = page.getByRole('button', { name: '閱讀選單', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu).not.toContainText('計算')
    await expect.poll(async () => (await progress(page))?.location.cfi).toMatch(/^epubcfi\(/)
    const first = (await progress(page))!.location.cfi
    await menu.click()
    await page.getByRole('button', { name: '下一頁', exact: true }).click()
    await expect.poll(async () => (await progress(page))?.location.cfi).not.toBe(first)
    await page.getByRole('button', { name: '目錄', exact: true }).click()
    await page.getByRole('button', { name: '第二章', exact: true }).click()
    await expect.poll(async () => (await progress(page))?.percentage).toBeGreaterThan(0.45)
    const slider = page.getByRole('slider', { name: '閱讀進度' })
    await slider.fill('68')
    await expect.poll(async () => (await progress(page))?.percentage).toBeGreaterThan(0.6)
    await expect.poll(async () => (await progress(page))?.percentage).toBeLessThan(0.73)
    await page.getByRole('button', { name: '返回書架' }).click()
    const saved = (await progress(page))!
    if (browserName === 'chromium') await context.setOffline(true)
    await page.reload()
    await page.getByRole('button', { name: '書籍資訊 午後的書頁', exact: true }).click()
    await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
    await expect(menu).toBeVisible()
    await expect(menu).not.toContainText('計算')
    await expect.poll(async () => (await progress(page))?.location.cfi).toBe(saved.location.cfi)
    await page.screenshot({ path: `artifacts/preview/reader-${browserName}-${version}.png` })
    // Center tap toggles controls without turning a page.
    const host = (await page.locator('.epub-host').boundingBox())!
    await page.mouse.click(host.x + host.width / 2, host.y + host.height / 2)
    await expect(page.getByRole('button', { name: '返回書架' })).toBeVisible()
    await page.getByRole('button', { name: '隱藏閱讀選單' }).click()
    const beforeTap = (await progress(page))!.location.cfi
    const viewport = page.viewportSize()!
    await page.mouse.click(viewport.width - 30, viewport.height / 2)
    await expect.poll(async () => (await progress(page))?.location.cfi).not.toBe(beforeTap)
    const afterTap = (await progress(page))!.location.cfi
    // Exercise the same pointer gesture path used by a touch swipe. Swiping back is
    // the deterministic direction here: the tap above just moved a page forward.
    await page.mouse.move(viewport.width * 0.3, viewport.height / 2)
    await page.mouse.down()
    await page.mouse.move(viewport.width * 0.7, viewport.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => (await progress(page))?.location.cfi).not.toBe(afterTap)
    const beforeResize = (await progress(page))!.percentage
    await page.setViewportSize({ width: 852, height: 393 })
    await expect(page.locator('.epub-host iframe').first()).toHaveCSS('height', '335px')
    await expect
      .poll(async () => Math.abs(((await progress(page))?.percentage ?? 0) - beforeResize))
      .toBeLessThan(0.05)
    await menu.click()
    await slider.fill('100')
    await expect(menu).toHaveText('100%')
    await expect(page.getByRole('button', { name: '下一頁', exact: true })).toBeDisabled()
    await slider.fill('0')
    await expect(page.getByRole('button', { name: '上一頁', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '返回書架' }).click()
    expect(errors).toEqual([])
  })
}

test('EPUB chapter changes stay covered until the no-animation page is ready', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await page.getByLabel('選擇書籍檔案').setInputFiles({
    name: 'reading.epub',
    mimeType: 'application/epub+zip',
    buffer: await makeReadingEpub(),
  })
  await page.getByRole('button', { name: '書籍資訊 午後的書頁', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await expect(page.getByRole('button', { name: '閱讀選單', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '閱讀選單', exact: true }).click()
  await page.getByRole('button', { name: '閱讀排版' }).click()
  await page.getByRole('group', { name: '翻頁效果' }).getByRole('button', { name: '關閉' }).click()
  await page.getByRole('button', { name: '關閉排版' }).click()
  await expect(page.getByRole('button', { name: '返回書架' })).toBeEnabled()
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('.epub-host')!
    const record = { insertedWhileHidden: 0, insertedWhileVisible: 0 }
    const observer = new MutationObserver((changes) => {
      if (
        !changes.some((change) =>
          [...change.addedNodes].some(
            (node) =>
              node instanceof HTMLIFrameElement ||
              (node instanceof Element && node.querySelector('iframe')),
          ),
        )
      )
        return
      if (host.style.visibility === 'hidden') record.insertedWhileHidden++
      else record.insertedWhileVisible++
    })
    observer.observe(host, { childList: true, subtree: true })
    Object.assign(window, { __readerTurnRecord: record, __readerTurnObserver: observer })
  })
  await page.getByRole('button', { name: '目錄', exact: true }).click()
  await page.getByRole('button', { name: '第二章', exact: true }).click()
  await expect
    .poll(async () =>
      page
        .locator('.epub-host iframe')
        .first()
        .evaluate((frame: HTMLIFrameElement) =>
          frame.contentDocument?.body?.textContent?.includes('第二章'),
        ),
    )
    .toBe(true)
  const record = await page.evaluate(() => {
    const state = window as unknown as {
      __readerTurnRecord: { insertedWhileHidden: number; insertedWhileVisible: number }
      __readerTurnObserver: MutationObserver
    }
    state.__readerTurnObserver.disconnect()
    return state.__readerTurnRecord
  })
  expect(record.insertedWhileHidden).toBeGreaterThan(0)
  expect(record.insertedWhileVisible).toBe(0)
  await expect(page.locator('.epub-host')).toHaveCSS('visibility', 'visible')
  await expect(page.locator('.reader-page')).toHaveCSS('transform', 'none')
})
