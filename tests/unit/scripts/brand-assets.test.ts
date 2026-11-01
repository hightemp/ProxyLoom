import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const pngHeader = (path: string) => {
  const image = readFileSync(path)
  expect(image.subarray(0, 8).equals(pngSignature)).toBe(true)
  return {
    colorType: image.readUInt8(25),
    height: image.readUInt32BE(20),
    width: image.readUInt32BE(16),
  }
}

const svgViewBox = (path: string): string | undefined =>
  /viewBox="([^"]+)"/u.exec(readFileSync(path, 'utf8'))?.[1]

describe('brand assets', () => {
  it.each([16, 32, 48, 128])('ships a %ipx RGBA extension icon', (size) => {
    expect(pngHeader(`public/icon-${size}.png`)).toEqual({
      colorType: 6,
      height: size,
      width: size,
    })
  })

  it('keeps a full-detail vector source and a pixel-fitted 16px source', () => {
    expect(svgViewBox('public/icon.svg')).toBe('0 0 128 128')
    expect(svgViewBox('store/assets/icon-small.svg')).toBe('0 0 16 16')
  })

  it('uses the thread-routing mark everywhere instead of the legacy letter mark', () => {
    const legacyLetterPath = /M31 89V39h30|M50 93V55h23/u
    for (const path of ['public/icon.svg', 'store/assets/promo-small-440x280.svg']) {
      expect(readFileSync(path, 'utf8')).not.toMatch(legacyLetterPath)
    }
  })

  it('renders the options sidebar brand mark from the packaged icon', () => {
    const options = readFileSync('entrypoints/options/App.vue', 'utf8')
    expect(options).toMatch(/<img[^>]+class="brand-mark"[^>]+src="\/icon\.svg"/u)
    expect(options).not.toContain("t('extensionAbbreviation')")
  })
})
