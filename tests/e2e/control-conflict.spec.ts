import type { Worker } from '@playwright/test'

import { expect, test } from './fixtures/extension'

const controlWorker = async (workers: readonly Worker[]): Promise<Worker> => {
  for (const worker of workers) {
    const name = await worker.evaluate(
      () =>
        (
          globalThis as unknown as {
            chrome: { runtime: { getManifest(): { name: string } } }
          }
        ).chrome.runtime.getManifest().name,
    )
    if (name === 'ProxyLoom E2E Control Fixture') return worker
  }
  throw new Error('The proxy-control fixture worker is unavailable.')
}

test('reports another proxy extension without fighting it and Retry recovers after control release', async ({
  extensionContext,
  extensionId,
  extensionPage,
}) => {
  const worker = await controlWorker(extensionContext.serviceWorkers())
  await worker.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: {
          proxy: {
            settings: {
              set(details: { scope: 'regular'; value: { mode: 'direct' } }): Promise<void>
            }
          }
        }
      }
    ).chrome.proxy.settings.set({
      scope: 'regular',
      value: { mode: 'direct' },
    }),
  )

  await extensionPage.reload()
  await expect(extensionPage.getByText('CONTROLLED BY OTHER EXTENSION')).toBeVisible()
  await extensionPage.getByRole('button', { name: 'DIRECT' }).click()
  await expect(extensionPage.getByRole('alert')).toContainText(
    'NOT_CONTROLLABLE: CONTROLLED_BY_OTHER_EXTENSION',
  )

  const stillOwned = await worker.evaluate(async () => {
    const settings = (
      globalThis as unknown as {
        chrome: {
          proxy: {
            settings: {
              get(details: { incognito: false }): Promise<{ levelOfControl?: string }>
            }
          }
        }
      }
    ).chrome.proxy.settings
    return (await settings.get({ incognito: false })).levelOfControl
  })
  expect(stillOwned).toBe('controlled_by_this_extension')

  const popup = await extensionContext.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByRole('alert')).toContainText(
    'NOT_CONTROLLABLE: CONTROLLED_BY_OTHER_EXTENSION',
  )
  await popup.getByRole('button', { name: 'Retry apply' }).click()
  await expect(popup.getByRole('alert')).toContainText(
    'NOT_CONTROLLABLE: CONTROLLED_BY_OTHER_EXTENSION',
  )

  await worker.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: {
          proxy: {
            settings: {
              clear(details: { scope: 'regular' }): Promise<void>
            }
          }
        }
      }
    ).chrome.proxy.settings.clear({ scope: 'regular' }),
  )
  await popup.getByRole('button', { name: 'Retry apply' }).click()
  await expect(popup.getByRole('alert')).toHaveCount(0)
  await expect(popup.getByText('DIRECT', { exact: true }).first()).toBeVisible()
  await popup.close()
})
