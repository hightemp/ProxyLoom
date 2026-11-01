import { expect, test } from './fixtures/extension'

interface ExtensionApi {
  readonly storage: {
    readonly local: { clear(): Promise<void> }
    readonly session: {
      clear(): Promise<void>
      get(key: string): Promise<Record<string, unknown>>
    }
  }
}

test('temporarily disables a rule for the session and re-enables it', async ({ extensionPage }) => {
  await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    await api.storage.session.clear()
    await api.storage.local.clear()
  })
  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: 'RULES', exact: true }).click()
  await extensionPage.getByRole('button', { name: /^Rules/ }).click()
  await extensionPage.getByRole('button', { name: 'Add rule' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Example direct')
  await extensionPage.getByLabel('Regular expression').fill('^https://example\\.com/$')
  await extensionPage.getByLabel('Route via').selectOption('DIRECT')
  await extensionPage.getByRole('button', { name: 'Save rule' }).click()

  const resolve = async () => {
    await extensionPage.getByLabel('URL', { exact: true }).fill('https://example.com/')
    await extensionPage.getByRole('button', { name: 'Resolve route' }).click()
  }
  await resolve()
  await expect(extensionPage.locator('.route-result')).toContainText('Direct · Rule')

  const row = extensionPage.getByRole('listitem').filter({ hasText: 'Example direct' })
  await row.getByRole('button', { name: 'More actions for Example direct' }).click()
  await row.getByRole('menuitem', { name: 'Disable for 5 minutes' }).click()
  await expect(row.locator('.temp-disabled')).toContainText('Disabled until')
  await expect(extensionPage.getByLabel('Enable Example direct', { exact: true })).toBeChecked()

  await resolve()
  await expect(extensionPage.locator('.route-result')).toContainText('No rule matched')
  await expect(extensionPage.locator('.route-result')).toContainText('Temporarily disabled')

  const stored = await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    return (await api.storage.session.get('session.rule-disables'))['session.rule-disables']
  })
  expect(stored).toMatchObject([{ state: { kind: 'UNTIL' } }])

  await row.getByRole('button', { name: 'More actions for Example direct' }).click()
  await row.getByRole('menuitem', { name: 'Re-enable now' }).click()
  await expect(row.locator('.temp-disabled')).toHaveCount(0)
  await resolve()
  await expect(extensionPage.locator('.route-result')).toContainText('Direct · Rule')
})
