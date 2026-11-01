import { readFile } from 'node:fs/promises'

import { chromium } from '@playwright/test'

// Rasterizes the vector brand sources with Chromium so gradients render exactly as in the browser.
// The 16px toolbar icon uses a pixel-fitted simplified source; larger sizes use the full mark.
const targets = [
  { source: 'store/assets/icon-small.svg', output: 'public/icon-16.png', width: 16, height: 16 },
  { source: 'public/icon.svg', output: 'public/icon-32.png', width: 32, height: 32 },
  { source: 'public/icon.svg', output: 'public/icon-48.png', width: 48, height: 48 },
  { source: 'public/icon.svg', output: 'public/icon-128.png', width: 128, height: 128 },
  { source: 'public/icon.svg', output: 'store/assets/logo-300.png', width: 300, height: 300 },
  {
    source: 'store/assets/promo-small-440x280.svg',
    output: 'store/assets/promo-small-440x280.png',
    width: 440,
    height: 280,
  },
]

const browser = await chromium.launch()
try {
  for (const { source, output, width, height } of targets) {
    const svg = (await readFile(source, 'utf8')).replace(
      /<svg\b[^>]*?(?=>)/u,
      (tag) =>
        `${tag.replace(/\s(?:width|height)="[^"]*"/gu, '')} width="${width}" height="${height}"`,
    )
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`)
    await page.locator('body > svg').screenshot({ path: output, omitBackground: true })
    await page.close()
    process.stdout.write(`${output} ${width}x${height}\n`)
  }
} finally {
  await browser.close()
}
