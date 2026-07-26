import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

interface ExtensionTestFixtures {
  readonly extensionPage: Page
}

interface ExtensionWorkerFixtures {
  readonly extensionContext: BrowserContext
  readonly extensionId: string
}

const extensionPath = resolve('.output/chrome-mv3')
const controlExtensionPath = resolve('tests/e2e/fixtures/control-extension')
const browserExecutable = process.env.PROXYLOOM_BROWSER_EXECUTABLE
const headed = process.env.PROXYLOOM_HEADED === '1'
const rendererAccessibility = process.env.PROXYLOOM_RENDERER_ACCESSIBILITY === '1'

export const test = base.extend<ExtensionTestFixtures, ExtensionWorkerFixtures>({
  extensionContext: [
    async ({ browserName }, use) => {
      if (browserName !== 'chromium') {
        throw new Error(
          `The unpacked-extension fixture requires Chromium, received ${browserName}.`,
        )
      }
      const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-e2e-'))
      const context = await chromium.launchPersistentContext(userDataDirectory, {
        args: [
          `--disable-extensions-except=${extensionPath},${controlExtensionPath}`,
          `--load-extension=${extensionPath},${controlExtensionPath}`,
          '--disable-component-update',
          '--host-resolver-rules=MAP *.proxyloom.test 127.0.0.1,EXCLUDE 127.0.0.1',
          '--ignore-certificate-errors',
          '--no-default-browser-check',
          '--no-first-run',
          '--proxy-bypass-list=<-loopback>',
          ...(rendererAccessibility ? ['--force-renderer-accessibility'] : []),
        ],
        ...(browserExecutable === undefined
          ? { channel: 'chromium' as const }
          : { executablePath: browserExecutable }),
        headless: !headed,
        ignoreHTTPSErrors: true,
      })
      try {
        await use(context)
      } finally {
        await context.close()
        await rm(userDataDirectory, { force: true, recursive: true })
      }
    },
    { scope: 'worker' },
  ],
  extensionId: [
    async ({ extensionContext }, use) => {
      const findProxyLoomWorker = async () => {
        for (const worker of extensionContext.serviceWorkers()) {
          const name = await worker.evaluate(
            () =>
              (
                globalThis as unknown as {
                  chrome: { runtime: { getManifest(): { name: string } } }
                }
              ).chrome.runtime.getManifest().name,
          )
          if (name === 'ProxyLoom') return worker
        }
        return undefined
      }
      let serviceWorker = await findProxyLoomWorker()
      while (serviceWorker === undefined) {
        await extensionContext.waitForEvent('serviceworker')
        serviceWorker = await findProxyLoomWorker()
      }
      await use(new URL(serviceWorker.url()).host)
    },
    { scope: 'worker' },
  ],
  extensionPage: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    try {
      await use(page)
    } finally {
      await page.close()
    }
  },
})

export { expect } from '@playwright/test'
