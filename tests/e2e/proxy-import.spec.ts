import { expect, test } from './fixtures/extension'

interface ExtensionApi {
  readonly storage: {
    readonly local: {
      clear(): Promise<void>
      get(key: string): Promise<Record<string, unknown>>
    }
    readonly session: { clear(): Promise<void> }
  }
}

test('imports proxies from pasted lines with a preview and updates on repeat', async ({
  extensionPage,
}) => {
  await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    await api.storage.session.clear()
    await api.storage.local.clear()
  })
  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: /^Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Import from text' }).click()

  const panel = extensionPage.getByRole('region', { name: 'Import from text' })
  await panel
    .getByLabel('Proxy lines')
    .fill(
      [
        '# office pool',
        'https://alice:s3cret@192.0.2.10:8443',
        '192.0.2.11:3128:bob:pw',
        'socks5://192.0.2.12:1080',
      ].join('\n'),
    )
  const rows = panel.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('HTTPS 192.0.2.10:8443')
  await expect(rows.nth(1)).toContainText('HTTP 192.0.2.11:3128')
  await expect(rows.nth(2)).toContainText('SOCKS5 is not supported yet')
  await expect(panel).not.toContainText('s3cret')

  await panel.getByRole('button', { name: 'Import (2)' }).click()
  await expect(extensionPage.getByRole('status')).toContainText(
    'Imported: 2 created, 0 updated, 1 skipped.',
  )
  await expect(extensionPage.getByRole('heading', { name: '192.0.2.10:8443' })).toBeVisible()
  await expect(extensionPage.getByRole('heading', { name: '192.0.2.11:3128' })).toBeVisible()

  const stored = await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    const config = (await api.storage.local.get('config.v1'))['config.v1'] as {
      profiles: { name: string; useSameProxy: boolean; httpEndpoint: Record<string, unknown> }[]
    }
    return config.profiles.map((profile) => ({
      endpoint: profile.httpEndpoint,
      name: profile.name,
      same: profile.useSameProxy,
    }))
  })
  expect(stored).toEqual([
    {
      endpoint: {
        host: '192.0.2.10',
        password: 's3cret',
        port: 8443,
        transport: 'HTTPS',
        username: 'alice',
      },
      name: '192.0.2.10:8443',
      same: true,
    },
    {
      endpoint: {
        host: '192.0.2.11',
        password: 'pw',
        port: 3128,
        transport: 'HTTP',
        username: 'bob',
      },
      name: '192.0.2.11:3128',
      same: true,
    },
  ])

  await extensionPage.getByRole('button', { name: 'Import from text' }).click()
  await extensionPage.getByRole('button', { name: 'Import from text' }).click()
  const again = extensionPage.getByRole('region', { name: 'Import from text' })
  await again.getByLabel('Proxy lines').fill('192.0.2.11:3128:bob:changed')
  await expect(again.locator('tbody tr')).toContainText('Updates 192.0.2.11:3128')
  await again.getByRole('button', { name: 'Import (1)' }).click()
  await expect(extensionPage.getByRole('status')).toContainText(
    'Imported: 0 created, 1 updated, 0 skipped.',
  )
})

test('fills the profile editor from a pasted proxy string', async ({ extensionPage }) => {
  await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    await api.storage.session.clear()
    await api.storage.local.clear()
  })
  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: /^Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Add profile' }).click()
  await extensionPage.getByLabel('Paste proxy string').fill('https://carol:pw@192.0.2.20:8443')
  await extensionPage.getByLabel('Paste proxy string').press('Enter')
  await expect(extensionPage.getByLabel('Host', { exact: true })).toHaveValue('192.0.2.20')
  await expect(extensionPage.getByLabel('Paste proxy string')).toHaveValue('')
  await extensionPage.getByRole('button', { name: 'Save profile' }).click()
  await expect(extensionPage.getByRole('heading', { name: '192.0.2.20:8443' })).toBeVisible()
})
