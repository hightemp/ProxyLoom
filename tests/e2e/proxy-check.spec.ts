import type { Page } from '@playwright/test'

import { startHttpProxy } from '../integration/proxies/http-proxy'
import { startHttpOrigin } from '../integration/servers/http-origin'
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

test('checks an inactive profile through that proxy, excludes the check from logs, and restores DIRECT', async ({
  extensionContext,
  extensionPage,
}) => {
  const origin = await startHttpOrigin()
  const proxy = await startHttpProxy({ marker: 'manual-check-proxy' })
  try {
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await resetExtension(extensionPage)
    await extensionPage.getByRole('button', { name: /Proxies/ }).click()
    await extensionPage.getByRole('button', { name: 'Add profile' }).click()
    await extensionPage.getByLabel('Name', { exact: true }).fill('Check proxy')
    await extensionPage.getByLabel('Host', { exact: true }).fill(proxy.host)
    await extensionPage.getByLabel('Port', { exact: true }).fill(String(proxy.port))
    await extensionPage.getByLabel('Check URL').fill(`${targetOrigin}/ip`)
    await extensionPage.getByRole('button', { name: 'Save profile' }).click()

    const profileCard = extensionPage.locator('.profile-card').filter({ hasText: 'Check proxy' })
    extensionPage.once('dialog', (dialog) => dialog.accept())
    await profileCard.getByRole('button', { name: 'Check' }).click()

    await expect
      .poll(() => ({
        origin: origin.requests.map((request) => request.path),
        proxy: proxy.requests.map((request) => request.target),
      }))
      .toMatchObject({
        origin: expect.arrayContaining(['/ip']),
        proxy: expect.arrayContaining([expect.stringContaining('/ip')]),
      })
    await expect(profileCard.locator('.check-result')).toContainText('Available')
    await expect(profileCard.locator('.check-result')).toContainText('192.0.2.10')
    expect(proxy.requests.some((request) => request.target.startsWith(`${targetOrigin}/ip`))).toBe(
      true,
    )
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/ip' &&
          request.headers['x-proxyloom-test-proxy'] === 'manual-check-proxy',
      ),
    ).toBe(true)

    const postCheckState: unknown = await extensionPage.evaluate(async () => {
      const extensionApi = (
        globalThis as unknown as {
          chrome: {
            runtime: {
              sendMessage(message: unknown): Promise<unknown>
            }
          }
        }
      ).chrome
      return await extensionApi.runtime.sendMessage({
        logQuery: {
          errorsOnly: false,
          hostname: 'origin.proxyloom.test',
          limit: 100,
          offset: 0,
          platform: null,
        },
        type: 'GET_STATE',
      })
    })
    expect(postCheckState).toMatchObject({
      ok: true,
      value: {
        config: { general: { mode: 'DIRECT' } },
        logs: [],
      },
    })

    proxy.reset()
    origin.reset()
    const directPage = await extensionContext.newPage()
    await directPage.goto(`${targetOrigin}/after-check`)
    await directPage.close()
    expect(proxy.requests).toHaveLength(0)
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/after-check' &&
          request.headers['x-proxyloom-test-proxy'] === undefined,
      ),
    ).toBe(true)
  } finally {
    await Promise.all([origin.close(), proxy.close()])
  }
})

test('cancels a hanging inactive-profile check and restores direct routing', async ({
  extensionContext,
  extensionPage,
}) => {
  const origin = await startHttpOrigin()
  const proxy = await startHttpProxy({ failureMode: 'HANG', marker: 'hanging-check-proxy' })
  try {
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await resetExtension(extensionPage)
    await extensionPage.getByRole('button', { name: /Proxies/ }).click()
    await extensionPage.getByRole('button', { name: 'Add profile' }).click()
    await extensionPage.getByLabel('Name', { exact: true }).fill('Hanging proxy')
    await extensionPage.getByLabel('Host', { exact: true }).fill(proxy.host)
    await extensionPage.getByLabel('Port', { exact: true }).fill(String(proxy.port))
    await extensionPage.getByLabel('Check URL').fill(`${targetOrigin}/ip`)
    await extensionPage.getByRole('button', { name: 'Save profile' }).click()

    const profileCard = extensionPage.locator('.profile-card').filter({ hasText: 'Hanging proxy' })
    extensionPage.once('dialog', (dialog) => dialog.accept())
    await profileCard.getByRole('button', { name: 'Check' }).click()
    await expect(profileCard.getByRole('button', { name: 'Cancel check' })).toBeVisible()
    await expect.poll(() => proxy.requests.length).toBeGreaterThan(0)
    await profileCard.getByRole('button', { name: 'Cancel check' }).click()
    await expect(profileCard.getByRole('button', { name: 'Check' })).toBeVisible()

    proxy.setFailureMode('NONE')
    proxy.reset()
    origin.reset()
    const directPage = await extensionContext.newPage()
    await directPage.goto(`${targetOrigin}/after-cancel`)
    await directPage.close()
    expect(proxy.requests).toHaveLength(0)
    expect(origin.requests.some((request) => request.path === '/after-cancel')).toBe(true)
  } finally {
    await Promise.all([origin.close(), proxy.close()])
  }
})

test('recovers the committed route after the worker is interrupted during a check', async ({
  extensionContext,
  extensionId,
  extensionPage,
}) => {
  const origin = await startHttpOrigin()
  const proxy = await startHttpProxy({ failureMode: 'HANG', marker: 'interrupted-check-proxy' })
  try {
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await resetExtension(extensionPage)
    await extensionPage.getByRole('button', { name: /Proxies/ }).click()
    await extensionPage.getByRole('button', { name: 'Add profile' }).click()
    await extensionPage.getByLabel('Name', { exact: true }).fill('Interrupted check')
    await extensionPage.getByLabel('Host', { exact: true }).fill(proxy.host)
    await extensionPage.getByLabel('Port', { exact: true }).fill(String(proxy.port))
    await extensionPage.getByLabel('Check URL').fill(`${targetOrigin}/ip`)
    await extensionPage.getByRole('button', { name: 'Save profile' }).click()

    const profileCard = extensionPage
      .locator('.profile-card')
      .filter({ hasText: 'Interrupted check' })
    extensionPage.once('dialog', (dialog) => dialog.accept())
    await profileCard.getByRole('button', { name: 'Check' }).click()
    await expect.poll(() => proxy.requests.length).toBeGreaterThan(0)

    await extensionPage.evaluate(async () => {
      const extensionApi = (
        globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                get(key: string): Promise<{
                  'config.v1'?: {
                    general: {
                      activeProxyProfileId: string | null
                      mode: 'DIRECT' | 'PROXY' | 'RULES'
                    }
                    profiles: { id: string; name: string }[]
                    revision: number
                  }
                }>
                set(values: Record<string, unknown>): Promise<void>
              }
            }
          }
        }
      ).chrome
      const stored = await extensionApi.storage.local.get('config.v1')
      const config = stored['config.v1']
      const profile = config?.profiles.find(({ name }) => name === 'Interrupted check')
      if (config === undefined || profile === undefined) {
        throw new Error('Committed profile is unavailable during the recovery test.')
      }
      await extensionApi.storage.local.set({
        'config.v1': {
          ...config,
          general: {
            ...config.general,
            activeProxyProfileId: profile.id,
            mode: 'PROXY',
          },
          revision: config.revision + 1,
        },
      })
    })

    const cdp = await extensionContext.newCDPSession(extensionPage)
    const { targetInfos } = await cdp.send('Target.getTargets')
    const workerTarget = targetInfos.find(
      (target) => target.type === 'service_worker' && new URL(target.url).host === extensionId,
    )
    if (workerTarget === undefined)
      throw new Error('ProxyLoom service worker target is unavailable.')
    await cdp.send('Target.closeTarget', { targetId: workerTarget.targetId })
    await cdp.detach()

    const recoveredPage = await extensionContext.newPage()
    await recoveredPage.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(recoveredPage.getByRole('heading', { name: 'General' })).toBeVisible()
    await expect
      .poll(() =>
        recoveredPage.evaluate(async () => {
          const extensionApi = (
            globalThis as unknown as {
              chrome: {
                proxy: {
                  settings: {
                    get(details: { incognito: boolean }): Promise<{ value: { mode?: string } }>
                  }
                }
                storage: {
                  session: {
                    get(key: string): Promise<{
                      'session.transient'?: { proxyCheckRecoveryRevision?: number | null }
                    }>
                  }
                }
              }
            }
          ).chrome
          const [settings, session] = await Promise.all([
            extensionApi.proxy.settings.get({ incognito: false }),
            extensionApi.storage.session.get('session.transient'),
          ])
          return {
            mode: settings.value.mode,
            recoveryRevision: session['session.transient']?.proxyCheckRecoveryRevision ?? null,
          }
        }),
      )
      .toEqual({ mode: 'pac_script', recoveryRevision: null })

    proxy.setFailureMode('NONE')
    proxy.reset()
    origin.reset()
    const routedPage = await extensionContext.newPage()
    await routedPage.goto(`${targetOrigin}/after-interruption`)
    await routedPage.close()
    expect(
      proxy.requests.some((request) =>
        request.target.startsWith(`${targetOrigin}/after-interruption`),
      ),
    ).toBe(true)
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/after-interruption' &&
          request.headers['x-proxyloom-test-proxy'] === 'interrupted-check-proxy',
      ),
    ).toBe(true)
    await recoveredPage.close()
  } finally {
    await Promise.all([origin.close(), proxy.close()])
  }
})
