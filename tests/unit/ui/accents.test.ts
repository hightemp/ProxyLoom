import { describe, expect, it } from 'vitest'

import { ACCENTS, applyAppearance } from '../../../src/ui/theme/accents'

const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const [r, g, b] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

// Neutral surfaces from base.css; accents must read on all of them.
const SURFACES = {
  dark: { bg: '#0f1218', surface: '#171b23' },
  light: { bg: '#f5f6f8', surface: '#ffffff' },
} as const

describe('accent palettes', () => {
  it.each(Object.keys(ACCENTS))('%s meets WCAG AA in light and dark schemes', (name) => {
    const accent = ACCENTS[name as keyof typeof ACCENTS]
    for (const scheme of ['light', 'dark'] as const) {
      const palette = accent[scheme]
      for (const background of [SURFACES[scheme].bg, SURFACES[scheme].surface, palette.soft]) {
        expect(
          contrast(palette.primary, background),
          `${name} ${scheme} text`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast('#ffffff', palette.fill), `${name} ${scheme} fill`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('applies theme and accent variables to the document root', () => {
    const root = document.createElement('html')
    applyAppearance(root, { accent: 'TEAL', theme: 'DARK' })
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.accent).toBe('teal')
    expect(root.style.getPropertyValue('--accent-l-primary')).toBe(ACCENTS.TEAL.light.primary)
    expect(root.style.getPropertyValue('--accent-d-fill')).toBe(ACCENTS.TEAL.dark.fill)
  })
})
