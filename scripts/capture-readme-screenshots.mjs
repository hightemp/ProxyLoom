// Captures the README screenshots in the light theme for every bundled UI language.
// Uses only synthetic demo data (documentation IP ranges, example hostnames, no credentials).
// Usage: pnpm build && pnpm capture:readme-screenshots
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'

const extensionPath = resolve('.output/chrome-mv3')
// Demo names follow the UI language so each README shows a coherent screen.
const LANGUAGES = [
  {
    code: 'en',
    env: 'en_US.UTF-8',
    names: {
      amsterdam: 'Amsterdam',
      docs: 'Docs paths',
      frankfurt: 'Frankfurt',
      intranet: 'Intranet',
      local: 'Local network',
      news: 'News',
      office: 'Office gateway',
      video: 'Video sites',
    },
  },
  {
    code: 'ru',
    env: 'ru_RU.UTF-8',
    names: {
      amsterdam: 'Амстердам',
      docs: 'Пути документации',
      frankfurt: 'Франкфурт',
      intranet: 'Интранет',
      local: 'Локальная сеть',
      news: 'Новости',
      office: 'Офисный шлюз',
      video: 'Видеосайты',
    },
  },
]

const at = '2026-11-01T09:00:00.000Z'
const endpoint = (host, port, transport = 'HTTP') => ({
  host,
  password: '',
  port,
  transport,
  username: '',
})
const check = (ip, country, totalDurationMs, downloadMbps = null) => ({
  availability: true,
  checkedAt: at,
  connectDurationMs: null,
  country,
  downloadMbps,
  errorCode: null,
  externalIp: ip,
  httpStatus: 200,
  speedErrorCode: null,
  totalDurationMs,
})
const profile = (id, name, shortName, color, http, lastCheck, extra = {}) => ({
  checkUrl: 'https://api.country.is/',
  color,
  createdAt: at,
  generatedShortName: shortName,
  httpEndpoint: http,
  httpsEndpoint: http,
  id,
  lastCheck,
  name,
  note: '',
  shortName,
  updatedAt: at,
  useSameProxy: true,
  ...extra,
})
const rule = (id, position, name, pattern, profileId, extra = {}) => ({
  action:
    profileId === null
      ? { targetProxyProfileId: null, type: 'DIRECT' }
      : { targetProxyProfileId: profileId, type: 'PROXY' },
  createdAt: at,
  description: '',
  enabled: true,
  flags: 'i',
  id,
  matcherType: 'ORIGIN',
  name,
  pattern,
  position,
  temporaryDisable: null,
  updatedAt: at,
  validity: 'VALID',
  ...extra,
})

const demoProfiles = (names) => [
  profile(
    'demo-frankfurt',
    names.frankfurt,
    'FRA',
    '#3A52E0',
    { ...endpoint('203.0.113.10', 3128), password: 'demo-pass', username: 'demo-user' },
    check('203.0.113.10', 'DE', 84, 92.4),
  ),
  profile(
    'demo-amsterdam',
    names.amsterdam,
    'AMS',
    '#0F766E',
    endpoint('198.51.100.24', 8080, 'HTTPS'),
    check('198.51.100.24', 'NL', 61),
  ),
  profile(
    'demo-office',
    names.office,
    'OFF',
    '#B45309',
    endpoint('proxy.corp.example', 8080),
    null,
  ),
]
const demoRules = (names) => [
  rule(
    'demo-video',
    0,
    names.video,
    '^https://([a-z0-9-]+\\.)*video\\.example(?::\\d+)?/$',
    'demo-frankfurt',
  ),
  rule(
    'demo-intranet',
    1,
    names.intranet,
    '^https?://([a-z0-9-]+\\.)*corp\\.example(?::\\d+)?/$',
    'demo-office',
  ),
  rule('demo-local', 2, names.local, '^https?://(localhost|127\\.0\\.0\\.1)(?::\\d+)?/$', null),
  rule('demo-news', 3, names.news, '^https://news\\.example/$', 'demo-amsterdam', {
    enabled: false,
  }),
  rule('demo-paths', 4, names.docs, '^https://docs\\.example/private/.*$', 'demo-amsterdam', {
    matcherType: 'FULL_URL',
  }),
]

const send = (page, message) =>
  page.evaluate((request) => globalThis.chrome.runtime.sendMessage(request), message)

const seed = async (page, names) => {
  const exported = await send(page, { includeCredentials: true, type: 'EXPORT_NATIVE' })
  const document = JSON.parse(exported.value.text)
  document.config = {
    ...document.config,
    general: {
      ...document.config.general,
      activeProxyProfileId: 'demo-frankfurt',
      mode: 'RULES',
    },
    profiles: demoProfiles(names),
    rules: demoRules(names),
  }
  const applied = await send(page, {
    mode: 'REPLACE',
    replaceConfirmed: true,
    text: JSON.stringify(document),
    type: 'APPLY_NATIVE_IMPORT',
  })
  if (!applied.ok) throw new Error(`Demo import failed: ${JSON.stringify(applied.error)}`)
}

for (const language of LANGUAGES) {
  const output = resolve('screenshots', language.code)
  await mkdir(output, { recursive: true })
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-readme-'))
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--lang=${language.code}`,
      '--disable-component-update',
      '--no-default-browser-check',
      '--no-first-run',
    ],
    channel: 'chromium',
    colorScheme: 'light',
    env: { ...process.env, LANG: language.env, LANGUAGE: language.code },
    headless: true,
    locale: language.code,
    viewport: { height: 760, width: 1280 },
  })
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    const extensionId = new URL(worker.url()).host
    const page = await context.newPage()
    const open = async (section) => {
      await page.goto(`chrome-extension://${extensionId}/options.html#${section}`)
      await page.locator('main h1').waitFor()
      await page.waitForTimeout(400)
    }
    await open('general')
    await seed(page, language.names)

    for (const section of ['general', 'proxies', 'rules', 'appearance', 'help']) {
      await open(section)
      await page.screenshot({ animations: 'disabled', path: join(output, `${section}.png`) })
    }

    await open('rules')
    await page
      .locator('.rule-row')
      .first()
      .locator('button[aria-label]')
      .filter({
        has: page.locator('svg.lucide-pencil'),
      })
      .click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(300)
    await page.screenshot({ animations: 'disabled', path: join(output, 'rule-editor.png') })

    const popup = await context.newPage()
    await popup.setViewportSize({ height: 600, width: 380 })
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.waitForTimeout(600)
    await popup.screenshot({ animations: 'disabled', path: join(output, 'popup.png') })
  } finally {
    await context.close()
    await rm(userDataDirectory, { force: true, recursive: true })
  }
}
