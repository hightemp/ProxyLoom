import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'

import { expect, test } from './fixtures/extension'

const percentile95 = (samples: readonly number[]): number => {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY
}

test('cold browser and service-worker popup reaches usable state below 1500 ms p95', async () => {
  const extensionPath = resolve('.output/chrome-mv3')
  const samples: number[] = []
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-cold-popup-'))
    const startedAt = performance.now()
    const context = await chromium.launchPersistentContext(userDataDirectory, {
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
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const extensionId = new URL(worker.url()).host
      const popup = await context.newPage()
      await popup.goto(`chrome-extension://${extensionId}/popup.html`)
      await expect(popup.getByRole('button', { name: 'Open Settings' })).toBeEnabled()
      samples.push(performance.now() - startedAt)
    } finally {
      await context.close()
      await rm(userDataDirectory, { force: true, recursive: true })
    }
  }
  const p95 = percentile95(samples)
  test.info().annotations.push({
    description: `${p95.toFixed(2)} ms across ${String(samples.length)} clean profiles`,
    type: 'cold-popup-p95',
  })
  expect(p95).toBeLessThanOrEqual(1_500)
})

test('warm popup reaches its usable state below 750 ms p95', async ({
  extensionContext,
  extensionId,
}) => {
  const popup = await extensionContext.newPage()
  const samples: number[] = []
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const startedAt = performance.now()
    await popup.goto(`chrome-extension://${extensionId}/popup.html?iteration=${String(iteration)}`)
    await expect(popup.getByRole('button', { name: 'Open Settings' })).toBeEnabled()
    samples.push(performance.now() - startedAt)
  }
  const p95 = percentile95(samples)
  test.info().annotations.push({
    description: `${p95.toFixed(2)} ms across ${String(samples.length)} samples`,
    type: 'warm-popup-p95',
  })
  expect(p95).toBeLessThanOrEqual(750)
  await popup.close()
})

test('an ordinary rule edit persists and applies below the 2 second threshold', async ({
  extensionPage,
}) => {
  await extensionPage.getByRole('button', { name: /^Rules/ }).click()
  await extensionPage.getByRole('button', { name: 'Add rule' }).click()
  await extensionPage
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Performance budget rule')
  await extensionPage.getByLabel('Route via').selectOption('DIRECT')
  const startedAt = performance.now()
  await extensionPage.getByRole('button', { name: 'Save rule' }).click()
  await expect(extensionPage.getByRole('status')).toContainText('Saved and applied.')
  const elapsedMs = performance.now() - startedAt
  test.info().annotations.push({
    description: `${elapsedMs.toFixed(2)} ms`,
    type: 'rule-edit-apply',
  })
  expect(elapsedMs).toBeLessThanOrEqual(2_000)
})
