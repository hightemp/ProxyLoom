import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'

import { createDefaultConfig } from '../../src/storage/seed/create-default-config'

const extensionPath = resolve('.output/chrome-mv3')

const launch = (userDataDirectory: string): Promise<BrowserContext> =>
  chromium.launchPersistentContext(userDataDirectory, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--disable-component-update',
      '--no-default-browser-check',
      '--no-first-run',
    ],
    channel: 'chromium',
    headless: true,
  })

const openOptions = async (
  context: BrowserContext,
): Promise<{ extensionId: string; page: Page }> => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()
  return { extensionId, page }
}

test('preserves local configuration and clears normal/private session state after browser restart', async () => {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-browser-restart-'))
  let firstContext: BrowserContext | undefined
  let secondContext: BrowserContext | undefined
  try {
    firstContext = await launch(userDataDirectory)
    const first = await openOptions(firstContext)
    const config = createDefaultConfig(new Date('2026-07-26T12:00:00.000Z'))
    const beforeRestart = await first.page.evaluate(async (persistedConfig) => {
      const extensionApi = (
        globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                clear(): Promise<void>
                set(values: Record<string, unknown>): Promise<void>
              }
              session: {
                clear(): Promise<void>
                get(key: string): Promise<Record<string, unknown>>
                set(values: Record<string, unknown>): Promise<void>
              }
            }
            tabs: {
              create(details: { active: boolean; url: string }): Promise<{ id?: number }>
            }
          }
        }
      ).chrome
      await Promise.all([extensionApi.storage.local.clear(), extensionApi.storage.session.clear()])
      await extensionApi.storage.local.set({ 'config.v1': persistedConfig })
      const source = await extensionApi.tabs.create({ active: false, url: 'about:blank' })
      if (source.id === undefined) throw new Error('Restart source tab has no ID.')
      const baseOverride = {
        action: { targetProxyProfileId: null, type: 'DIRECT' },
        createdAt: '2026-07-26T12:00:00.000Z',
        expiresOnTabClose: true,
        generatedPattern: '^https://restart\\.proxyloom\\.test/$',
        originKey: 'https://restart.proxyloom.test/',
        platformScope: 'ORIGIN',
        scope: 'EXACT_HOSTNAME',
        sourceTabId: source.id,
      }
      await extensionApi.storage.session.set({
        'session.overrides': [
          {
            ...baseOverride,
            id: 'restart-normal',
            incognito: false,
          },
          {
            ...baseOverride,
            id: 'restart-private',
            incognito: true,
          },
        ],
        'session.transient': {
          authAttempts: { 'restart-request': 1 },
          proxyCheckRecoveryRevision: persistedConfig.revision,
        },
      })
      return await extensionApi.storage.session.get('session.overrides')
    }, config)
    expect(JSON.stringify(beforeRestart)).toContain('restart-normal')
    expect(JSON.stringify(beforeRestart)).toContain('restart-private')

    await firstContext.close()
    firstContext = undefined

    secondContext = await launch(userDataDirectory)
    const second = await openOptions(secondContext)
    expect(second.extensionId).toBe(first.extensionId)
    await expect
      .poll(() =>
        second.page.evaluate(async () => {
          const extensionApi = (
            globalThis as unknown as {
              chrome: {
                proxy: {
                  settings: {
                    get(details: { incognito: boolean }): Promise<{ value: { mode?: string } }>
                  }
                }
                storage: {
                  local: {
                    get(key: string): Promise<{
                      'config.v1'?: { general?: { mode?: string }; schemaVersion?: number }
                    }>
                  }
                  session: {
                    get(keys: string[]): Promise<Record<string, unknown>>
                  }
                }
              }
            }
          ).chrome
          const [local, session, proxy] = await Promise.all([
            extensionApi.storage.local.get('config.v1'),
            extensionApi.storage.session.get(['session.overrides', 'session.transient']),
            extensionApi.proxy.settings.get({ incognito: false }),
          ])
          return {
            localMode: local['config.v1']?.general?.mode,
            schemaVersion: local['config.v1']?.schemaVersion,
            session,
            proxyMode: proxy.value.mode,
          }
        }),
      )
      .toEqual({
        localMode: 'DIRECT',
        proxyMode: 'direct',
        schemaVersion: 1,
        session: { 'session.overrides': [] },
      })
  } finally {
    await firstContext?.close()
    await secondContext?.close()
    await rm(userDataDirectory, { force: true, recursive: true })
  }
})
