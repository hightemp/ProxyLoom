import { expect, test } from './fixtures/extension'

test('proxy rows keep their columns aligned when one profile is the global proxy', async ({
  extensionPage,
}) => {
  await extensionPage.setViewportSize({ width: 1300, height: 700 })
  await extensionPage.getByRole('button', { name: /^Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Import from text' }).click()
  await extensionPage.getByLabel('Proxy lines').fill('192.0.2.51:8080\n192.0.2.52:8080')
  await extensionPage.getByRole('button', { name: 'Import (2)' }).click()
  const rows = extensionPage.locator('.proxy-row')
  await expect(rows).toHaveCount(2)
  await rows
    .first()
    .getByRole('button', { name: /Use .* globally/ })
    .click()
  await expect(rows.first().locator('.global-marker')).toBeVisible()

  const left = async (selector: string): Promise<number[]> =>
    Promise.all(
      (await rows.all()).map(async (row) => (await row.locator(selector).first().boundingBox())!.x),
    )
  for (const column of ['.proxy-endpoint', '.proxy-user', '.proxy-status', '.row-actions']) {
    const [first, second] = await left(column)
    expect(Math.abs(first! - second!), column).toBeLessThan(1)
  }
})
