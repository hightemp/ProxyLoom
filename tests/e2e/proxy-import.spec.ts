import { acceptConfirm, expect, test } from './fixtures/extension'

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

test('copies a profile as URL and curl to the clipboard', async ({ extensionPage }) => {
  await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    await api.storage.session.clear()
    await api.storage.local.clear()
  })
  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: /^Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Add profile' }).click()
  await extensionPage.getByLabel('Paste proxy string').fill("http://dave:it's@192.0.2.30:3128")
  await extensionPage.getByRole('button', { name: 'Fill' }).click()
  await extensionPage.getByRole('button', { name: 'Save profile' }).click()

  // Record what reaches the real clipboard API; success is reported only when the write resolves.
  await extensionPage.evaluate(() => {
    const clipboard = navigator.clipboard
    const write = clipboard.writeText.bind(clipboard)
    const target = globalThis as unknown as { copied: string[] }
    target.copied = []
    clipboard.writeText = async (text: string) => {
      target.copied.push(text)
      await write(text)
    }
  })
  const copied = () =>
    extensionPage.evaluate(() => (globalThis as unknown as { copied: string[] }).copied)
  const card = extensionPage.locator('.profile-card').filter({ hasText: '192.0.2.30:3128' })
  await card.getByText('Copy as').click()
  await card.getByRole('button', { name: 'URL', exact: true }).click()
  await expect(extensionPage.getByRole('status')).toContainText('contains the proxy password')
  await card.getByRole('button', { name: 'curl', exact: true }).click()
  await expect
    .poll(copied)
    .toEqual([
      "http://dave:it's@192.0.2.30:3128",
      `curl -x 'http://dave:it'\\''s@192.0.2.30:3128' 'https://api.country.is/'`,
    ])
  await expect(extensionPage.getByRole('status')).not.toContainText('Could not copy')
})

test('handles 500 profiles with search, select all shown and bulk delete', async ({
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
  const lines = Array.from(
    { length: 500 },
    (_, index) => `10.1.${Math.floor(index / 100)}.${(index % 100) + 1}:8080`,
  ).join('\n')
  const panel = extensionPage.getByRole('region', { name: 'Import from text' })
  await panel.getByLabel('Proxy lines').fill(lines)
  const started = Date.now()
  await panel.getByRole('button', { name: 'Import (500)' }).click()
  await expect(extensionPage.getByText('Showing 500 of 500')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(5_000)

  await extensionPage.getByLabel('Search name or host').fill('10.1.4.')
  await expect(extensionPage.getByText('Showing 100 of 500')).toBeVisible()
  await extensionPage.getByRole('button', { name: 'Select all shown' }).click()
  await extensionPage.getByRole('button', { name: 'Delete selected (100)' }).click()
  await acceptConfirm(extensionPage)
  await expect(extensionPage.getByText('Showing 0 of 400')).toBeVisible()
  await extensionPage.getByLabel('Search name or host').fill('')
  await expect(extensionPage.getByText('Showing 400 of 400')).toBeVisible()
})
