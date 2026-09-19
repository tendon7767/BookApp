import { test, expect } from '@playwright/test'
import { preview } from 'vite'

test('installs its shell, reopens offline and keeps the saved theme', async ({
  page,
  context,
  browserName,
}) => {
  // Playwright SW network emulation is supported on Chromium. Windows WebKit 26.6
  // throws an internal error on reload after setOffline(true); do not call that a pass.
  // The separate server-shutdown test exercises cached startup on both engines.
  test.skip(
    browserName !== 'chromium',
    'Full network-offline SW emulation requires Chromium; real iPhone airplane-mode testing remains required.',
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('region', { name: '書架', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready')
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: '深夜', exact: false }).click()
  await expect(page.getByRole('button', { name: '深夜', exact: false })).toBeEnabled()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('region', { name: '書架', exact: true })).toBeVisible()
  await expect(page.getByText('雲端離線', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready')
  const reopened = await context.newPage()
  await page.close()
  await reopened.goto('./')
  await expect(reopened.getByRole('region', { name: '書架', exact: true })).toBeVisible()
  await reopened.getByRole('button', { name: '設定', exact: true }).click()
  await reopened.getByRole('button', { name: '明亮', exact: false }).click()
  await expect(reopened.getByRole('button', { name: '明亮', exact: false })).toBeEnabled()
  await reopened.reload()
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test('cached app reopens when the origin server is completely stopped', async ({
  page,
  context,
}) => {
  const server = await preview({ preview: { host: 'localhost', port: 0, strictPort: true } })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Preview server address unavailable')
  const url = `http://localhost:${address.port}/BookApp/`
  let stopped = false
  const stop = async () => {
    if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections()
    await server.close()
  }
  try {
    await page.goto(url)
    await expect(page.locator('html')).toHaveAttribute('data-offline', 'ready')
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await page.getByRole('button', { name: '設定', exact: true }).click()
    await page.getByRole('button', { name: '深夜', exact: false }).click()
    await expect(page.getByRole('button', { name: '深夜', exact: false })).toBeEnabled()
    await stop()
    stopped = true
    await page.reload()
    await expect(page.getByRole('region', { name: '書架', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const reopened = await context.newPage()
    await page.close()
    await reopened.goto(url)
    await expect(reopened.getByRole('region', { name: '書架', exact: true })).toBeVisible()
    await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark')
  } finally {
    if (!stopped) await stop()
  }
})

test('unavailable device storage shows an error without breaking the app', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    }
  })
  await page.goto('./')
  await expect(page.getByText(/無法讀取本機設定/)).toBeVisible()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: '深夜', exact: false }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('alert')).toContainText('未能保存')
})

test('serves a scoped manifest and local installation icons', async ({ request }) => {
  const manifest = await request.get('manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  const data = await manifest.json()
  expect(data).toMatchObject({
    name: '看書',
    display: 'standalone',
    start_url: '/BookApp/',
    scope: '/BookApp/',
  })
  for (const icon of data.icons) {
    const response = await request.get(icon.src)
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('image/png')
  }
  expect((await request.get('icons/apple-touch-icon.png')).ok()).toBeTruthy()
})

test('installation instructions work at narrow and landscape viewport sizes', async ({ page }) => {
  await page.goto('./')
  for (const size of [
    { width: 320, height: 568 },
    { width: 393, height: 852 },
    { width: 852, height: 393 },
  ]) {
    await page.setViewportSize(size)
    await expect(page.getByRole('region', { name: '書架', exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
  }
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: /^加入主畫面/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '知道了' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
