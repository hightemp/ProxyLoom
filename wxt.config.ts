import { defineConfig } from 'wxt'

import { PRODUCT } from './src/config/product'

const commonPermissions = [
  'alarms',
  'downloads',
  'notifications',
  'proxy',
  'scripting',
  'storage',
  'tabs',
  'webRequest',
] as const

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  srcDir: '.',
  outDir: '.output',
  zip: {
    excludeSources: ['coverage/**', 'playwright-report/**', 'test-results*/**', '**/*.log'],
  },
  manifest: ({ browser }) => ({
    name: PRODUCT.displayName,
    short_name: PRODUCT.shortName,
    description: PRODUCT.description,
    default_locale: 'en',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    permissions: [
      ...commonPermissions,
      browser === 'firefox' ? 'webRequestBlocking' : 'webRequestAuthProvider',
    ],
    host_permissions: ['<all_urls>'],
    incognito: 'spanning',
    minimum_chrome_version: browser === 'firefox' ? undefined : '128',
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: PRODUCT.firefoxExtensionId,
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
                optional: ['locationInfo'],
              },
            },
          }
        : undefined,
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  }),
})
