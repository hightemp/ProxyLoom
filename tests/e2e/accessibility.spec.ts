import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/extension'

const assertNamedControls = async (page: Page): Promise<void> => {
  const violations = await page.locator('button, input, select, textarea').evaluateAll((controls) =>
    controls.flatMap((control) => {
      const element = control as HTMLButtonElement | HTMLInputElement
      if (
        element.hidden ||
        element.getAttribute('aria-hidden') === 'true' ||
        (element instanceof HTMLInputElement && element.type === 'hidden')
      ) {
        return []
      }
      const labels =
        'labels' in element && element.labels !== null
          ? [...element.labels].map((label) => label.textContent?.trim() ?? '').join(' ')
          : ''
      const name = [
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('aria-labelledby') ?? '',
        labels,
        element instanceof HTMLButtonElement ? (element.textContent?.trim() ?? '') : '',
      ]
        .join(' ')
        .trim()
      return name === '' ? [`${element.tagName.toLowerCase()} has no accessible name`] : []
    }),
  )
  expect(violations).toEqual([])
}

const assertNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const result = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth
    const overflow = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        const bounds = element.getBoundingClientRect()
        return bounds.right > clientWidth + 1 || bounds.left < -1
      })
      .map((element) => ({
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        tag: element.tagName.toLowerCase(),
      }))
      .slice(0, 20)
    return {
      clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      overflow,
    }
  })
  expect(result.documentScrollWidth, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(
    result.clientWidth,
  )
}

const relativeLuminance = (hex: string): number => {
  const normalized =
    hex.length === 4
      ? `#${hex
          .slice(1)
          .split('')
          .map((character) => `${character}${character}`)
          .join('')}`
      : hex
  const channels = normalized
    .match(/[a-f\d]{2}/giu)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

const contrastRatio = (foreground: string, background: string): number => {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  )
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

test('all options sections expose named native controls and a logical heading structure', async ({
  extensionPage,
}) => {
  const sections = [
    'General',
    'Proxies',
    'Rules',
    'Logs',
    'Import & Export',
    'Appearance',
    'About / Diagnostics',
  ]
  for (const section of sections) {
    await extensionPage.getByRole('button', { name: new RegExp(`^${section}`) }).click()
    await expect(extensionPage.locator('h1')).toHaveCount(1)
    await assertNamedControls(extensionPage)
  }
})

test('editor focus enters predictably and returns to the activating control', async ({
  extensionPage,
}) => {
  await extensionPage.getByRole('button', { name: /^Proxies/ }).click()
  const addProfile = extensionPage.getByRole('button', { name: 'Add profile' })
  await addProfile.focus()
  await addProfile.press('Enter')
  await expect(extensionPage.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused()
  await extensionPage.getByRole('button', { name: 'Cancel' }).click()
  await expect(addProfile).toBeFocused()

  await extensionPage.getByRole('button', { name: /^Rules/ }).click()
  const addRule = extensionPage.getByRole('button', { name: 'Add rule' })
  await addRule.focus()
  await addRule.press('Enter')
  await expect(extensionPage.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused()
  await extensionPage.getByRole('button', { name: 'Cancel' }).click()
  await expect(addRule).toBeFocused()
})

test('keyboard-only tab order traverses every options section', async ({ extensionPage }) => {
  await extensionPage.locator('body').click({ position: { x: 1, y: 1 } })
  const sectionNames = [
    /^General/,
    /^Proxies/,
    /^Rules/,
    /^Logs/,
    /^Import & Export/,
    /^Appearance/,
    /^About \/ Diagnostics/,
  ]
  for (const name of sectionNames) {
    await extensionPage.keyboard.press('Tab')
    await expect(extensionPage.getByRole('button', { name })).toBeFocused()
    await extensionPage.waitForTimeout(150)
  }
})

test('semantic color tokens meet text contrast and focus is visibly styled in both themes', async ({
  extensionPage,
}) => {
  await extensionPage.getByRole('button', { name: /^Appearance/ }).click()
  for (const theme of ['Light', 'Dark']) {
    await extensionPage.getByRole('button', { name: theme, exact: true }).click()
    const colors = await extensionPage.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const read = (name: string): string => style.getPropertyValue(name).trim()
      return {
        background: read('--color-bg'),
        danger: read('--color-danger'),
        dangerSoft: read('--color-danger-soft'),
        muted: read('--color-muted'),
        onPrimary: read('--color-on-primary'),
        primary: read('--color-primary'),
        primaryFill: read('--color-primary-fill'),
        primarySoft: read('--color-primary-soft'),
        success: read('--color-success-strong'),
        successSoft: read('--color-success-soft'),
        surface: read('--color-surface'),
        text: read('--color-text'),
        warning: read('--color-warning'),
        warningSoft: read('--color-warning-soft'),
      }
    })
    const pairs: readonly [string, string][] = [
      [colors.text, colors.background],
      [colors.text, colors.surface],
      [colors.muted, colors.background],
      [colors.muted, colors.surface],
      [colors.primary, colors.background],
      [colors.primary, colors.primarySoft],
      [colors.onPrimary, colors.primaryFill],
      [colors.danger, colors.dangerSoft],
      [colors.success, colors.successSoft],
      [colors.warning, colors.warningSoft],
    ]
    for (const [foreground, background] of pairs) {
      expect(
        contrastRatio(foreground, background),
        `${theme}: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }

    const focusedButton = extensionPage.getByRole('button', { name: theme, exact: true })
    await focusedButton.focus()
    await expect(focusedButton).toBeFocused()
    await focusedButton.press(theme === 'Dark' ? 'Shift+Tab' : 'Tab')
    expect(
      await extensionPage.evaluate(() =>
        document.activeElement === null
          ? 'none'
          : getComputedStyle(document.activeElement).boxShadow,
      ),
    ).not.toBe('none')
  }
})

test('popup and options reflow without document-level horizontal overflow at 200% equivalent', async ({
  extensionContext,
  extensionId,
  extensionPage,
}) => {
  await extensionPage.setViewportSize({ height: 450, width: 640 })
  await assertNoHorizontalOverflow(extensionPage)

  const popup = await extensionContext.newPage()
  await popup.setViewportSize({ height: 300, width: 195 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByRole('button', { name: 'Open Settings' })).toBeVisible()
  await assertNoHorizontalOverflow(popup)
  await assertNamedControls(popup)
  await popup.close()
})

test('options remain operable at actual 200% browser tab zoom', async ({ extensionPage }) => {
  await extensionPage.setViewportSize({ height: 800, width: 1280 })
  const zoom = await extensionPage.evaluate(async () => {
    const extensionApi = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            getCurrent(): Promise<{ id?: number }>
            getZoom(tabId: number): Promise<number>
            setZoom(tabId: number, zoomFactor: number): Promise<void>
          }
        }
      }
    ).chrome
    const tab = await extensionApi.tabs.getCurrent()
    if (tab?.id === undefined) throw new Error('Options page has no tab ID')
    await extensionApi.tabs.setZoom(tab.id, 2)
    return extensionApi.tabs.getZoom(tab.id)
  })

  try {
    expect(zoom).toBe(2)
    await expect(extensionPage.getByRole('heading', { name: 'General', exact: true })).toBeVisible()
    await extensionPage.getByRole('button', { name: /^About \/ Diagnostics/ }).click()
    await expect(
      extensionPage.getByRole('heading', { level: 1, name: 'About / Diagnostics' }),
    ).toBeVisible()
    await assertNamedControls(extensionPage)
    await assertNoHorizontalOverflow(extensionPage)
  } finally {
    await extensionPage.evaluate(async () => {
      const extensionApi = (
        globalThis as unknown as {
          chrome: {
            tabs: {
              getCurrent(): Promise<{ id?: number }>
              setZoom(tabId: number, zoomFactor: number): Promise<void>
            }
          }
        }
      ).chrome
      const tab = await extensionApi.tabs.getCurrent()
      if (tab?.id !== undefined) await extensionApi.tabs.setZoom(tab.id, 1)
    })
  }
})
