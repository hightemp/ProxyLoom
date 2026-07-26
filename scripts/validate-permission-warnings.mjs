import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'

const expectedWarnings = [
  'Read and change all your data on all websites',
  'Display notifications',
  'Manage your downloads',
]
const extensionPath = resolve('.output/chrome-mv3')
const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-permission-warnings-'))
const context = await chromium.launchPersistentContext(userDataDirectory, {
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--lang=en-US',
  ],
  channel: 'chromium',
  headless: true,
})

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  for (const target of ['chrome-mv3', 'firefox-mv3']) {
    const manifest = await readFile(resolve(`.output/${target}/manifest.json`), 'utf8')
    const warnings = await worker.evaluate(
      async (manifestSource) =>
        await globalThis.chrome.management.getPermissionWarningsByManifest(manifestSource),
      manifest,
    )
    if (JSON.stringify(warnings) !== JSON.stringify(expectedWarnings)) {
      throw new Error(`${target}: permission warning review required: ${JSON.stringify(warnings)}`)
    }
    process.stdout.write(`${JSON.stringify({ target, warnings })}\n`)
  }
} finally {
  await context.close()
  await rm(userDataDirectory, { force: true, recursive: true })
}
