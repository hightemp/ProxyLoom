import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
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
  await page.goto(page.url().split('#')[0]!)
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()
}

test('persists explicit dark theme across options, popup, and error surfaces', async ({
  extensionContext,
  extensionId,
  extensionPage,
}) => {
  await extensionPage.getByRole('button', { name: /Appearance/ }).click()
  await extensionPage.getByRole('button', { name: 'Dark' }).click()
  await expect(extensionPage.locator('html')).toHaveAttribute('data-theme', 'dark')

  const popup = await extensionContext.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'dark')

  const errorPage = await extensionContext.newPage()
  await errorPage.goto(`chrome-extension://${extensionId}/error.html`)
  await expect(errorPage.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(errorPage.getByText('No safe error context is available.')).toBeVisible()
  await Promise.all([popup.close(), errorPage.close()])

  await extensionPage.emulateMedia({ colorScheme: 'dark' })
  await extensionPage.getByRole('button', { name: 'System' }).click()
  await expect(extensionPage.locator('html')).toHaveAttribute('data-theme', 'system')
  await expect
    .poll(() =>
      extensionPage.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
      ),
    )
    .toBe('#111522')
  await extensionPage.emulateMedia({ colorScheme: 'light' })
  await expect
    .poll(() =>
      extensionPage.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
      ),
    )
    .toBe('#f5f7fb')
})

test('shows honest browser-owned Chromium incognito status and help', async ({ extensionPage }) => {
  await extensionPage.getByRole('button', { name: /General/ }).click()
  await expect(
    extensionPage.getByText('ProxyLoom cannot enable this browser-owned permission.'),
  ).toBeVisible()
  await expect(extensionPage.getByText(/open this extension's browser details page/i)).toBeVisible()
  await expect(extensionPage.getByText('Browser permission:').locator('..')).toContainText(
    /Allowed|Not allowed|Unknown/,
  )
})

test('previews and imports supported FoxyProxy profiles only', async ({ extensionPage }) => {
  await extensionPage.getByRole('button', { name: /Import & Export/ }).click()
  const file = resolve('tests/fixtures/foxyproxy/v8-redacted.json')
  await extensionPage.getByLabel('FoxyProxy JSON file').setInputFiles(file)
  await extensionPage.getByRole('button', { name: 'Parse and preview' }).click()

  await expect(extensionPage.getByText('Detected FOXYPROXY_8_PLUS')).toBeVisible()
  await expect(extensionPage.getByText(/Unsupported SOCKS/)).toBeVisible()
  await extensionPage.getByRole('button', { name: 'Import selected profiles' }).click()

  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  await expect(extensionPage.getByRole('heading', { name: 'Office HTTP' })).toBeVisible()
  await expect(extensionPage.getByRole('heading', { name: 'Secure gateway' })).toBeVisible()
  await expect(extensionPage.getByText('Unsupported SOCKS')).toHaveCount(0)
})

test('exports without credential keys by default', async ({ extensionPage }) => {
  await extensionPage.getByRole('button', { name: /Import & Export/ }).click()
  const downloadPromise = extensionPage.waitForEvent('download')
  await extensionPage.getByRole('button', { name: 'Download JSON export' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (path === null) throw new Error('The export download has no local path.')
  const text = await readFile(path, 'utf8')
  expect(text).not.toContain('"username"')
  expect(text).not.toContain('"password"')
  expect(text).not.toContain('"logs"')
  expect(text).not.toContain('"overrides"')
})

test('previews and atomically replaces configuration through the native import UI', async ({
  extensionPage,
}) => {
  await resetExtension(extensionPage)
  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  await extensionPage.getByRole('button', { name: 'Add profile' }).click()
  await extensionPage.getByLabel('Name', { exact: true }).fill('Native source')
  await extensionPage.getByLabel('Host', { exact: true }).fill('127.0.0.1')
  await extensionPage.getByLabel('Port', { exact: true }).fill('8080')
  await extensionPage.getByRole('button', { name: 'Save profile' }).click()

  await extensionPage.getByRole('button', { name: /Import & Export/ }).click()
  const downloadPromise = extensionPage.waitForEvent('download')
  await extensionPage.getByRole('button', { name: 'Download JSON export' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (path === null) throw new Error('The native export download has no local path.')
  const exported = await readFile(path)

  await resetExtension(extensionPage)
  await extensionPage.getByRole('button', { name: /Import & Export/ }).click()
  await extensionPage.getByLabel('Native JSON file').setInputFiles({
    buffer: exported,
    mimeType: 'application/json',
    name: 'native-replace.json',
  })
  await extensionPage.getByRole('button', { name: 'Validate and preview' }).click()
  await expect(extensionPage.getByText(/1 profiles/)).toBeVisible()
  await expect(extensionPage.getByText(/Credentials:.*not present/)).toBeVisible()
  await extensionPage.getByRole('button', { name: 'Replace', exact: true }).click()
  extensionPage.once('dialog', (dialog) => dialog.accept())
  await extensionPage.getByRole('button', { name: 'Apply Replace' }).click()
  await expect(extensionPage.getByRole('status')).toContainText('Native import committed')

  await extensionPage.getByRole('button', { name: /Proxies/ }).click()
  await expect(extensionPage.getByRole('heading', { name: 'Native source' })).toBeVisible()
})

test('shows redacted local logs and applies filters and clear through visible UI', async ({
  extensionContext,
  extensionPage,
}) => {
  await resetExtension(extensionPage)
  const target = await extensionContext.newPage()
  await target.route('http://logs.proxyloom.test/**', (route) =>
    route.fulfill({
      body: '<!doctype html><title>Log target</title>',
      contentType: 'text/html',
      status: 200,
    }),
  )
  await target.goto(
    'http://logs.proxyloom.test/user:password@example.com/private/path?token=canary#fragment',
  )

  await expect
    .poll(() =>
      extensionPage.evaluate(async () => {
        const response = await (
          globalThis as unknown as {
            chrome: {
              runtime: {
                sendMessage(message: unknown): Promise<{
                  ok: boolean
                  value?: { logs?: { hostname: string }[] }
                }>
              }
            }
          }
        ).chrome.runtime.sendMessage({
          logQuery: {
            errorsOnly: false,
            hostname: 'logs.proxyloom.test',
            limit: 100,
            offset: 0,
            platform: null,
          },
          type: 'GET_STATE',
        })
        return response.value?.logs?.some(({ hostname }) => hostname === 'logs.proxyloom.test')
      }),
    )
    .toBe(true)

  await extensionPage.reload()
  await extensionPage.getByRole('button', { name: /Logs/ }).click()
  await expect(extensionPage.getByText('http://logs.proxyloom.test').first()).toBeVisible()
  await expect(extensionPage.getByText(/private\/path|password@example|token=canary/)).toHaveCount(
    0,
  )

  await extensionPage.getByLabel('Hostname contains').fill('does-not-match.test')
  await extensionPage.getByRole('button', { name: 'Apply filters' }).click()
  await expect(extensionPage.getByText('No log entries', { exact: true })).toBeVisible()

  await extensionPage.getByLabel('Hostname contains').fill('logs.proxyloom.test')
  await extensionPage.getByRole('button', { name: 'Apply filters' }).click()
  await expect(extensionPage.getByText('http://logs.proxyloom.test').first()).toBeVisible()
  extensionPage.once('dialog', (dialog) => dialog.accept())
  await extensionPage.getByRole('button', { name: 'Clear logs' }).click()
  await expect(extensionPage.getByText('No log entries', { exact: true })).toBeVisible()
  await target.close()
})
