import { expect, test } from './fixtures/extension'

test('a help tip explains a field and opens the matching guide article', async ({
  extensionPage,
}) => {
  await extensionPage.getByRole('button', { name: /^Rules/ }).click()
  await extensionPage.getByRole('button', { name: 'Add rule' }).click()
  const dialog = extensionPage.getByRole('dialog', { name: 'Add rule' })
  await expect(dialog.getByLabel('Regular expression')).toBeVisible()

  const tip = dialog
    .locator('.field', { has: extensionPage.getByText('Regular expression', { exact: true }) })
    .getByRole('button', { name: 'More information' })
  await tip.click()
  const popover = extensionPage.getByRole('dialog', { name: 'More information' })
  await expect(popover).toContainText('its subdomains, any port')
  await extensionPage.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(tip).toBeFocused()

  await tip.click()
  await popover.getByRole('link', { name: 'Learn more' }).click()
  await extensionPage.keyboard.press('Escape')
  await expect(extensionPage.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible()
  await expect(
    extensionPage.getByRole('button', { name: 'Regular expression basics' }),
  ).toHaveAttribute('aria-expanded', 'true')

  await extensionPage.getByLabel('Search help').fill('Chromium')
  await expect(extensionPage.locator('[data-article="once"]')).toBeVisible()
  await expect(extensionPage.locator('[data-article="appearance"]')).toHaveCount(0)
})
