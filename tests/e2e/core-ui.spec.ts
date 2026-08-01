import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/extension'

const resetExtension = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const extensionApi = (
      globalThis as unknown as {
        chrome: {
          storage: {
            local: { clear(): Promise<void> }
            session: { clear(): Promise<void> }
          }
        }
      }
    ).chrome
    await extensionApi.storage.session.clear()
    await extensionApi.storage.local.clear()
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()
}

test('creates and persists a profile, global route, and ordered rule through the UI', async ({
  extensionContext,
  extensionId,
  extensionPage,
}) => {
  await resetExtension(extensionPage)

  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Add profile' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Office proxy')
  await extensionPage.getByLabel('Short name (optional, 1–3 ASCII letters or numbers)').fill('OFF')
  await extensionPage.getByLabel('Host', { exact: true }).fill('127.0.0.1')
  await extensionPage.getByLabel('Port', { exact: true }).fill('9')
  await extensionPage.getByRole('button', { name: 'Save profile' }).click()

  await expect(extensionPage.getByRole('heading', { name: 'Office proxy' })).toBeVisible()
  await extensionPage.getByRole('button', { name: /General/ }).click()
  await extensionPage
    .getByLabel('Global proxy profile')
    .selectOption({ label: 'Office proxy (OFF)' })
  await expect(extensionPage.getByRole('button', { name: 'PROXY' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await extensionPage.getByRole('button', { name: 'Add rule' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Example direct')
  await extensionPage.getByLabel('Regular expression').fill('^https://example\\.com/$')
  await expect(extensionPage.getByRole('button', { name: 'Save rule' })).toBeDisabled()
  await extensionPage.getByLabel('Route via').selectOption('DIRECT')
  await extensionPage.getByRole('button', { name: 'Save rule' }).click()
  await expect(extensionPage.getByText('Example direct', { exact: true })).toBeVisible()

  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  await expect(extensionPage.getByRole('heading', { name: 'Office proxy' })).toBeVisible()
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await expect(extensionPage.getByText('Example direct', { exact: true })).toBeVisible()

  const popup = await extensionContext.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByRole('button', { name: 'PROXY' })).toHaveAttribute('aria-pressed', 'true')
  await expect(popup.getByLabel('Use proxy globally')).not.toHaveValue('')
  await expect(popup.getByLabel('Use proxy globally')).toContainText('Office proxy')
  await popup.close()
})

test('supports drag, keyboard sorting, and blocks filtered reordering', async ({
  extensionPage,
}) => {
  await resetExtension(extensionPage)
  await extensionPage.getByRole('button', { name: /Rules/ }).click()

  for (const name of ['First rule', 'Second rule']) {
    await extensionPage.getByRole('button', { name: 'Add rule' }).click()
    await extensionPage.getByLabel('Name', { exact: true }).fill(name)
    await extensionPage
      .getByLabel('Regular expression')
      .fill(`^https://${name.startsWith('First') ? 'first' : 'second'}\\.example/$`)
    await extensionPage.getByLabel('Route via').selectOption('DIRECT')
    await extensionPage.getByRole('button', { name: 'Save rule' }).click()
  }

  const firstRow = extensionPage.getByRole('listitem').filter({
    hasText: 'First rule',
  })
  const secondRow = extensionPage.getByRole('listitem').filter({
    hasText: 'Second rule',
  })
  await firstRow.dragTo(secondRow)
  const rows = extensionPage.getByRole('listitem')
  await expect
    .poll(async () => {
      const orderedNames = await rows.locator('.rule-title').allTextContents()
      return orderedNames.indexOf('Second rule') < orderedNames.indexOf('First rule')
    })
    .toBe(true)

  await firstRow.getByRole('button', { name: 'Move First rule up' }).click()
  await expect
    .poll(async () => {
      const orderedNames = await rows.locator('.rule-title').allTextContents()
      return orderedNames.indexOf('First rule') < orderedNames.indexOf('Second rule')
    })
    .toBe(true)

  await extensionPage.getByLabel('Search').fill('First')
  await expect(
    extensionPage
      .getByRole('listitem')
      .filter({ hasText: 'First rule' })
      .getByRole('button', { name: 'Move First rule down' }),
  ).toBeDisabled()
  await expect(extensionPage.getByText('Clear filters to reorder rules.')).toBeVisible()
})

test('runs local pattern and global routing testers and supports duplicate, disable, filter, and delete', async ({
  extensionPage,
}) => {
  await resetExtension(extensionPage)
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await extensionPage.getByRole('button', { name: 'Add rule' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Tester route')
  await extensionPage.getByLabel('Regular expression').fill('^https://example\\.com/$')
  await extensionPage.getByLabel('Route via').selectOption('DIRECT')

  await extensionPage.getByText('Single and multiple URL tester').click()
  await extensionPage
    .getByLabel('URLs, one per line')
    .fill('https://example.com/\nhttps://other.example/')
  await extensionPage.getByRole('button', { name: 'Test pattern' }).click()
  await expect(extensionPage.locator('.test-results')).toContainText('MATCH')
  await expect(extensionPage.locator('.test-results')).toContainText('NO MATCH')
  await expect(extensionPage.getByText(/No network request/)).toBeVisible()
  await extensionPage.getByRole('button', { name: 'Save rule' }).click()

  const original = extensionPage.getByRole('listitem').filter({ hasText: 'Tester route' }).first()
  await original.getByRole('button', { name: 'Duplicate' }).click()
  await expect(extensionPage.getByText('Tester route copy', { exact: true })).toBeVisible()

  await extensionPage.getByLabel('Enable Tester route', { exact: true }).uncheck()
  await extensionPage.getByLabel('Enabled', { exact: true }).selectOption('false')
  await expect(extensionPage.getByText('Tester route', { exact: true })).toBeVisible()
  await expect(extensionPage.getByText('Tester route copy', { exact: true })).toHaveCount(0)
  await extensionPage.getByRole('button', { name: 'Clear filters' }).click()

  await extensionPage.getByRole('button', { name: /General/ }).click()
  await extensionPage.getByRole('button', { name: 'RULES', exact: true }).click()
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await extensionPage.getByLabel('URL', { exact: true }).fill('https://example.com/')
  await extensionPage.getByRole('button', { name: 'Resolve route' }).click()
  await expect(extensionPage.locator('.route-result')).toContainText('DIRECT · RULE')

  const copy = extensionPage.getByRole('listitem').filter({ hasText: 'Tester route copy' }).first()
  await copy.getByRole('button', { name: 'Delete' }).click()
  await expect(extensionPage.getByText('Tester route copy', { exact: true })).toHaveCount(0)
})

test('duplicates a profile and safely invalidates referring routes when deleting the active original', async ({
  extensionPage,
}) => {
  await resetExtension(extensionPage)
  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Add profile' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Impact proxy')
  await extensionPage.getByLabel('Host', { exact: true }).fill('127.0.0.1')
  await extensionPage.getByLabel('Port', { exact: true }).fill('9')
  await extensionPage.getByRole('button', { name: 'Save profile' }).click()

  await extensionPage.getByRole('button', { name: /General/ }).click()
  await extensionPage.getByLabel('Global proxy profile').selectOption({ index: 1 })
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await extensionPage.getByRole('button', { name: 'Add rule' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Referring route')
  await extensionPage.getByLabel('Route via').selectOption({ label: 'Proxy · Impact proxy' })
  await extensionPage.getByRole('button', { name: 'Save rule' }).click()

  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  const original = extensionPage
    .locator('.profile-card')
    .filter({ hasText: 'Impact proxy' })
    .first()
  await original.getByRole('button', { name: 'Duplicate' }).click()
  await expect(extensionPage.getByRole('heading', { name: 'Impact proxy copy' })).toBeVisible()

  extensionPage.once('dialog', (dialog) => dialog.accept())
  await original.getByRole('button', { name: 'Delete' }).click()
  await expect(
    extensionPage.getByRole('heading', { name: 'Impact proxy', exact: true }),
  ).toHaveCount(0)
  await expect(extensionPage.getByRole('heading', { name: 'Impact proxy copy' })).toBeVisible()

  await extensionPage.getByRole('button', { name: /General/ }).click()
  await expect(extensionPage.getByRole('button', { name: 'DIRECT' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await expect(
    extensionPage.getByRole('listitem').filter({ hasText: 'Referring route' }),
  ).toContainText('INVALID REFERENCE')
  await extensionPage
    .getByRole('listitem')
    .filter({ hasText: 'Referring route' })
    .getByRole('button', { name: 'Edit' })
    .click()
  await expect(extensionPage.getByRole('alert')).toContainText('no longer exists')
  await expect(extensionPage.getByRole('button', { name: 'Save rule' })).toBeDisabled()
})

test('assigns domain suffix rules to different proxy profiles and persists the routes', async ({
  extensionPage,
}) => {
  await resetExtension(extensionPage)

  for (const [name, port] of [
    ['Proxy 1', '9001'],
    ['Proxy 2', '9002'],
  ] as const) {
    await extensionPage.getByRole('button', { name: /Proxies/ }).click()
    await extensionPage.getByRole('button', { name: 'Add profile' }).click()
    await extensionPage.getByLabel('Name', { exact: true }).fill(name)
    await extensionPage.getByLabel('Host', { exact: true }).fill('127.0.0.1')
    await extensionPage.getByLabel('Port', { exact: true }).fill(port)
    await extensionPage.getByRole('button', { name: 'Save profile' }).click()
  }

  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  for (const [name, suffixes, proxy] of [
    ['Russian domains', '.ru, .рф', 'Proxy 1'],
    ['German domains', '.de', 'Proxy 2'],
  ] as const) {
    await extensionPage.getByRole('button', { name: 'Add rule' }).click()
    await extensionPage.getByLabel('Name', { exact: true }).fill(name)
    await expect(extensionPage.locator('.editor').getByLabel('Action')).toHaveCount(0)
    await extensionPage.getByLabel('Template', { exact: true }).selectOption('DOMAIN_SUFFIXES')
    await extensionPage.getByLabel('Domain suffixes').fill(suffixes)
    await extensionPage.getByRole('button', { name: 'Generate editable pattern' }).click()
    await extensionPage.getByLabel('Route via').selectOption({ label: `Proxy · ${proxy}` })
    await extensionPage.getByRole('button', { name: 'Save rule' }).click()
  }

  await expect(
    extensionPage.getByRole('listitem').filter({ hasText: 'Russian domains' }),
  ).toContainText('Via Proxy 1')
  await expect(
    extensionPage.getByRole('listitem').filter({ hasText: 'German domains' }),
  ).toContainText('Via Proxy 2')

  await extensionPage.getByLabel('Proxy profile').selectOption({ label: 'Proxy 1' })
  await expect(extensionPage.getByText('Russian domains', { exact: true })).toBeVisible()
  await expect(extensionPage.getByText('German domains', { exact: true })).toHaveCount(0)
  await extensionPage.getByRole('button', { name: 'Clear filters' }).click()

  await extensionPage.getByRole('button', { name: /General/ }).click()
  await expect(
    extensionPage.getByText(/Rules are evaluated in Proxy and Rules modes/),
  ).toBeVisible()
  await extensionPage.getByRole('button', { name: 'RULES', exact: true }).click()
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await extensionPage.getByLabel('URL', { exact: true }).fill('https://example.ru/')
  await extensionPage.getByRole('button', { name: 'Resolve route' }).click()
  await expect(extensionPage.locator('.route-result')).toContainText('PROXY · RULE · Proxy 1')
  await extensionPage.getByLabel('URL', { exact: true }).fill('https://example.de/')
  await extensionPage.getByRole('button', { name: 'Resolve route' }).click()
  await expect(extensionPage.locator('.route-result')).toContainText('PROXY · RULE · Proxy 2')

  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await expect(
    extensionPage.getByRole('listitem').filter({ hasText: 'Russian domains' }),
  ).toContainText('Via Proxy 1')
  await expect(
    extensionPage.getByRole('listitem').filter({ hasText: 'German domains' }),
  ).toContainText('Via Proxy 2')
})

test('starts with an empty ordered rule list and no group management', async ({
  extensionPage,
}) => {
  await resetExtension(extensionPage)
  await extensionPage.getByRole('button', { name: /Rules/ }).click()
  await expect(extensionPage.getByText('No matching rules')).toBeVisible()
  await expect(extensionPage.getByRole('button', { name: 'Add rule' })).toBeEnabled()
  await expect(extensionPage.getByText('Groups', { exact: true })).toHaveCount(0)
  await expect(extensionPage.getByLabel('Group')).toHaveCount(0)
})

test('creates Once and Always routes from the real action popup and opens the matched rule', async ({
  extensionContext,
  extensionId,
  extensionPage,
}) => {
  await resetExtension(extensionPage)

  const site = await extensionContext.newPage()
  await site.route('http://popup.proxyloom.test/**', (route) =>
    route.fulfill({
      body: '<!doctype html><title>Popup route target</title>',
      contentType: 'text/html',
      status: 200,
    }),
  )
  await site.goto('http://popup.proxyloom.test/path?private=value')
  const targetTabId = await extensionPage.evaluate(async () => {
    const extensionApi = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            query(query: { url: string }): Promise<{ id?: number }[]>
          }
        }
      }
    ).chrome
    const [tab] = await extensionApi.tabs.query({ url: 'http://popup.proxyloom.test/*' })
    return tab?.id
  })
  if (targetTabId === undefined) throw new Error('Target tab ID is unavailable.')

  const openPopup = async (): Promise<Page> => {
    const popup = await extensionContext.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${targetTabId}`)
    await expect(popup.getByText('popup.proxyloom.test', { exact: true })).toBeVisible()
    return popup
  }

  let popup = await openPopup()
  await popup.getByRole('button', { name: 'RULES' }).click()
  popup.once('dialog', (dialog) => dialog.accept())
  await popup.getByRole('button', { name: 'Once' }).click()
  await expect(popup.locator('.current-site small')).toContainText('DIRECT · OVERRIDE')

  const sessionState = await extensionPage.evaluate(async () => {
    const extensionApi = (
      globalThis as unknown as {
        chrome: {
          storage: {
            session: {
              get(key: string): Promise<Record<string, unknown>>
            }
          }
        }
      }
    ).chrome
    const stored = await extensionApi.storage.session.get('session.overrides')
    return stored['session.overrides']
  })
  expect(sessionState).toMatchObject([
    {
      action: { type: 'DIRECT' },
      originKey: 'popup.proxyloom.test',
      sourceTabId: expect.any(Number),
    },
  ])

  await popup.close()
  await extensionPage.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: { storage: { session: { clear(): Promise<void> } } }
      }
    ).chrome.storage.session.clear(),
  )
  popup = await openPopup()
  popup.once('dialog', (dialog) => dialog.accept())
  await popup.getByRole('button', { name: 'Always (create rule)' }).click()
  await expect(popup.locator('.current-site small')).toContainText('DIRECT · RULE')
  await expect(popup.getByRole('button', { name: 'Edit matched rule' })).toBeVisible()

  const settingsPromise = extensionContext.waitForEvent('page')
  await popup.getByRole('button', { name: 'Edit matched rule' }).click()
  const ruleSettings = await settingsPromise
  await ruleSettings.waitForURL(`chrome-extension://${extensionId}/options.html#rules`)
  await expect(ruleSettings.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible()
  await expect(ruleSettings.getByText('popup.proxyloom.test direct', { exact: true })).toBeVisible()

  await ruleSettings.close()
  await site.close()
})
