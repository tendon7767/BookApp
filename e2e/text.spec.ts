import { test, expect, type Page } from '@playwright/test'
import { preview } from 'vite'

const text = Array.from(
  { length: 12 },
  (_, chapter) =>
    `第${chapter + 1}章 測試故事\n` +
    Array.from({ length: 45 }, (_, p) =>
      `段落${chapter}-${p}：窗外下著雨，旅人翻開書頁，繼續讀著故事。🌿 那是一個安靜的午後。`.repeat(
        3,
      ),
    ).join('\n\n'),
).join('\n')
const menu = (page: Page) => page.getByRole('button', { name: '閱讀選單', exact: true })
async function savedOffset(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('kanshu-local')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const r = db.transaction('progress').objectStore('progress').openCursor()
        r.onsuccess = () => resolve(r.result?.value.location.characterOffset ?? -1)
        r.onerror = () => reject(r.error)
      })
    } finally {
      db.close()
    }
  })
}
async function importText(page: Page, buffer = Buffer.from(text)) {
  await expect(page.getByLabel('選擇書籍檔案')).toBeEnabled()
  await page
    .getByLabel('選擇書籍檔案')
    .setInputFiles({ name: '文字測試.txt', mimeType: 'text/plain', buffer })
  await page.getByRole('button', { name: '書籍資訊 文字測試', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await expect(menu(page)).toBeVisible()
}
test('TXT pages have no gaps, restore exact offsets through typography/resize, and support TOC/seek', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await importText(page)
  await menu(page).click()
  const host = page.locator('.text-host')
  const next = page.getByRole('button', { name: '下一頁', exact: true })
  const previous = page.getByRole('button', { name: '上一頁', exact: true })
  const starts: number[] = []
  for (let i = 0; i < 6; i++) {
    const start = Number(await host.getAttribute('data-start'))
    const end = Number(await host.getAttribute('data-end'))
    starts.push(start)
    const paragraphs = await host.locator('p').allTextContents()
    expect(paragraphs.join('\n').replaceAll('\u200b', '')).toBe(
      text.slice(start, end).replace(/\n$/, ''),
    )
    const overflow = await host.evaluate(
      (el) => el.firstElementChild!.getBoundingClientRect().height - el.clientHeight,
    )
    expect(overflow).toBeLessThanOrEqual(0.1)
    await next.click()
    await expect(next).toBeEnabled()
    await expect(host).toHaveAttribute('data-start', String(end))
  }
  for (const start of starts.reverse()) {
    await previous.click()
    await expect(next).toBeEnabled()
    await expect(host).toHaveAttribute('data-start', String(start))
  }
  await page.getByRole('button', { name: '目錄', exact: true }).click()
  await page.getByRole('button', { name: '第8章 測試故事', exact: true }).click()
  await expect(host).toHaveAttribute('data-start', String(text.indexOf('第8章')))
  await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
  await expect.poll(() => savedOffset(page)).toBe(Math.floor(text.length * 0.68))
  const anchor = await savedOffset(page)
  await page.getByRole('button', { name: '閱讀排版' }).click()
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '放大字級' }).click()
  await page.getByRole('combobox', { name: '字體', exact: true }).selectOption('sans')
  await page.getByRole('slider', { name: '行距', exact: true }).fill('2.2')
  await page.getByRole('slider', { name: '段落間距', exact: true }).fill('1.4')
  await page.getByRole('slider', { name: '左右邊距', exact: true }).fill('38')
  await page.getByRole('button', { name: '深夜', exact: true }).click()
  await page.getByRole('button', { name: '關閉排版' }).click()
  await expect(next).toBeEnabled()
  await expect(host.locator('.text-page')).toHaveCSS('font-size', '26px')
  expect(await savedOffset(page)).toBe(anchor)
  await expect(host).toHaveAttribute('data-start', String(anchor))
  await page.setViewportSize({ width: 852, height: 393 })
  await expect(host).toHaveCSS('height', '315px')
  await expect(host).toHaveAttribute('data-start', String(anchor))
  await page.getByRole('button', { name: '返回書架' }).click()
  await page.getByRole('button', { name: '書籍資訊 文字測試', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await expect(menu(page)).toBeVisible()
  await expect(host).toHaveAttribute('data-start', String(anchor))
  await expect(host.locator('.text-page')).toHaveCSS('font-size', '26px')
  // Going back from a restored/seeked position calculates a preceding page on demand.
  await menu(page).click()
  await previous.click()
  await expect(next).toBeEnabled()
  await expect(host).toHaveAttribute('data-end', String(anchor))
  await next.click()
  await expect(next).toBeEnabled()
  await expect(host).toHaveAttribute('data-start', String(anchor))
  await page.getByRole('slider', { name: '閱讀進度' }).fill('100')
  await expect(next).toBeDisabled()
  await expect(menu(page)).toHaveText('100%')
  await page.getByRole('slider', { name: '閱讀進度' }).fill('0')
  await expect(previous).toBeDisabled()
  expect(errors).toEqual([])
})

test('large TXT stays bounded and encoding override survives reopen', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('./')
  const chunk = Buffer.from([
    0xb2, 0xc4, 0xa4, 0x40, 0xb3, 0xb9, 0x0a, 0xb4, 0xfa, 0xb8, 0xd5, 0x0a,
  ])
  const large = Buffer.concat([chunk, Buffer.alloc(8 * 1024 * 1024, 0x61)])
  await importText(page, large)
  await menu(page).click()
  const selector = page.getByRole('combobox', { name: 'TXT 編碼' })
  await selector.selectOption('big5')
  await expect(selector).toBeEnabled()
  await expect(page.locator('.text-host')).toContainText('第一章')
  await selector.selectOption('utf-8')
  await expect(selector).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('部分文字無法解碼')
  await selector.selectOption('big5')
  await expect(selector).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('slider', { name: '閱讀進度' }).fill('68')
  await expect.poll(() => savedOffset(page)).toBeGreaterThan(5000000)
  expect((await page.locator('.text-host').textContent())!.length).toBeLessThan(8193)
  await page.getByRole('button', { name: '返回書架' }).click()
  const anchor = await savedOffset(page)
  await page.getByRole('button', { name: '書籍資訊 文字測試', exact: true }).click()
  await page.getByRole('button', { name: '開始閱讀', exact: true }).click()
  await expect(menu(page)).toBeVisible()
  await menu(page).click()
  await expect(selector).toHaveValue('big5')
  await expect(page.locator('.text-host')).toHaveAttribute('data-start', String(anchor))
})

test('TXT decoder, first import and reopen work after the origin stops', async ({
  page,
  context,
}) => {
  const server = await preview({ preview: { host: 'localhost', port: 0, strictPort: true } })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('No server address')
  const url = `http://localhost:${address.port}/BookApp/`
  const stop = async () => {
    if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections()
    await server.close()
  }
  let stopped = false
  try {
    await page.goto(url)
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready')
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await stop()
    stopped = true
    await importText(page)
    await menu(page).click()
    await page.getByRole('button', { name: '下一頁', exact: true }).click()
    await expect.poll(() => savedOffset(page)).toBeGreaterThan(0)
    const anchor = await savedOffset(page)
    const reopened = await context.newPage()
    await page.close()
    await reopened.goto(url)
    await reopened.getByRole('button', { name: '書籍資訊 文字測試', exact: true }).click()
    await reopened.getByRole('button', { name: '開始閱讀', exact: true }).click()
    await expect(menu(reopened)).toBeVisible()
    await expect(reopened.locator('.text-host')).toHaveAttribute('data-start', String(anchor))
    await menu(reopened).click()
    await reopened.getByRole('button', { name: '目錄', exact: true }).click()
    await reopened.getByRole('button', { name: '第3章 測試故事', exact: true }).click()
    await reopened.getByRole('button', { name: '閱讀排版' }).click()
    await reopened.getByRole('button', { name: '放大字級' }).click()
    await expect(reopened.locator('.text-page')).toHaveCSS('font-size', '21px')
  } finally {
    if (!stopped) await stop()
  }
})

test('a swipe follows the finger, turns the page past the threshold and springs back below it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await importText(page)
  const surface = page.locator('.reader-touch-surface')
  const sheet = page.locator('.reader-page')
  const transform = () => sheet.evaluate((element) => element.style.transform)
  async function drag(to: number, release = true) {
    await page.mouse.move(320, 430)
    await page.mouse.down()
    for (const x of [300, 260, 200, to]) await page.mouse.move(x, 430, { steps: 4 })
    const held = await transform()
    if (release) await page.mouse.up()
    return held
  }
  await expect(surface).toBeVisible()
  const first = await savedOffset(page)
  // Below the threshold the page tracks the finger and then returns to its place.
  expect(await drag(290)).toMatch(/translate3d\(-?\d/)
  await expect.poll(transform).toBe('')
  expect(await savedOffset(page)).toBe(first)
  // A browser-cancelled gesture returns through the same spring-back path.
  expect(await drag(80, false)).toMatch(/translate3d\(-\d/)
  await surface.dispatchEvent('pointercancel')
  await expect(sheet).toHaveCSS('transition-duration', '0.18s')
  await page.mouse.up()
  await expect.poll(transform).toBe('')
  expect(await savedOffset(page)).toBe(first)
  // Past the threshold the drag completes into the next page.
  await page.evaluate(() => {
    const host = document.querySelector('.text-host')!
    const sheet = document.querySelector<HTMLElement>('.reader-page')!
    const observer = new MutationObserver(() => {
      Object.assign(window, { __textTurnOpacity: sheet.style.opacity })
      observer.disconnect()
    })
    observer.observe(host, { attributes: true, attributeFilter: ['data-start'] })
  })
  expect(await drag(80)).toMatch(/translate3d\(-\d/)
  await expect.poll(async () => await savedOffset(page)).toBeGreaterThan(first)
  expect(
    await page.evaluate(
      () => (window as unknown as { __textTurnOpacity: string }).__textTurnOpacity,
    ),
  ).toBe('0')
  await expect.poll(transform).toBe('')
  // Dragging back returns to the previous page.
  await page.mouse.move(80, 430)
  await page.mouse.down()
  for (const x of [140, 220, 320]) await page.mouse.move(x, 430, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => await savedOffset(page)).toBe(first)
  await expect.poll(transform).toBe('')
  // A tap turns the page outright, with no transform left behind.
  await page.mouse.click(360, 430)
  await expect.poll(async () => await savedOffset(page)).toBeGreaterThan(first)
  expect(await transform()).toBe('')
})

test('the vertical direction turns pages by swiping up and down', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')
  await importText(page)
  await menu(page).click()
  await page.getByRole('button', { name: '閱讀排版' }).click()
  await page.getByRole('button', { name: '上下', exact: true }).click()
  await page.getByRole('button', { name: '關閉排版' }).click()
  const sheet = page.locator('.reader-page')
  const transform = () => sheet.evaluate((element) => element.style.transform)
  const first = await savedOffset(page)
  // Swiping up moves the page with the finger and lands on the next page.
  await page.mouse.move(200, 600)
  await page.mouse.down()
  for (const y of [560, 480, 380, 200]) await page.mouse.move(200, y, { steps: 4 })
  expect(await transform()).toMatch(/translate3d\(0(px)?, -\d/)
  await page.mouse.up()
  await expect.poll(async () => await savedOffset(page)).toBeGreaterThan(first)
  await expect.poll(transform).toBe('')
  // Swiping back down returns to where it started.
  await page.mouse.move(200, 200)
  await page.mouse.down()
  for (const y of [260, 380, 500, 640]) await page.mouse.move(200, y, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => await savedOffset(page)).toBe(first)
  // A horizontal swipe no longer turns the page in this direction.
  await page.mouse.move(330, 430)
  await page.mouse.down()
  for (const x of [260, 160, 60]) await page.mouse.move(x, 430, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  expect(await savedOffset(page)).toBe(first)
})
