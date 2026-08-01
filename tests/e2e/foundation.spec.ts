import { expect, test } from './fixtures/extension'

test('loads the Manifest V3 extension and opens its surfaces', async ({
  extensionContext,
  extensionId,
}) => {
  const page = await extensionContext.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByRole('button', { name: 'DIRECT' })).toHaveAttribute('aria-pressed', 'true')

  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()

  await page.goto(`chrome-extension://${extensionId}/error.html`)
  await expect(page.getByRole('heading', { name: 'Proxy connection failed' })).toBeVisible()
  await page.close()
})

test('opens Settings as a standalone extension tab', async ({ extensionContext, extensionId }) => {
  const popup = await extensionContext.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)

  const settingsPagePromise = extensionContext.waitForEvent('page')
  await popup.getByRole('button', { name: 'Open Settings' }).click()
  const settingsPage = await settingsPagePromise
  await settingsPage.waitForLoadState('domcontentloaded')

  await expect(settingsPage).toHaveURL(`chrome-extension://${extensionId}/options.html`)
  await expect(settingsPage.getByRole('heading', { name: 'General', exact: true })).toBeVisible()

  await Promise.all([popup.close(), settingsPage.close()])
})
