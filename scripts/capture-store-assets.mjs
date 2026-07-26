import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'

const extensionPath = resolve('.output/chrome-mv3')
const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-store-assets-'))
const context = await chromium.launchPersistentContext(userDataDirectory, {
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--disable-component-update',
    '--no-default-browser-check',
    '--no-first-run',
  ],
  channel: 'chromium',
  colorScheme: 'light',
  headless: true,
  viewport: { height: 800, width: 1280 },
})

try {
  let serviceWorker = context.serviceWorkers()[0]
  if (serviceWorker === undefined) {
    serviceWorker = await context.waitForEvent('serviceworker')
  }
  const extensionId = new URL(serviceWorker.url()).host
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.getByRole('heading', { name: 'Global routing' }).waitFor()
  await page.screenshot({
    animations: 'disabled',
    path: 'store/assets/options-general-1280x800.png',
  })
  await page.close()
} finally {
  await context.close()
  await rm(userDataDirectory, { force: true, recursive: true })
}
