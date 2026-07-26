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
