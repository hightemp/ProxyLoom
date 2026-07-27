import { describe, expect, it } from 'vitest'

import { PRODUCT } from '../../../src/config/product'
import { productResourceLinks } from '../../../src/config/product-resources'

describe('product resource links', () => {
  it('does not render invented links in the release candidate', () => {
    expect(productResourceLinks(PRODUCT)).toEqual([])
  })

  it('normalizes centralized public support and privacy URLs', () => {
    expect(
      productResourceLinks({
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support',
      }),
    ).toEqual([
      { kind: 'SUPPORT', url: 'https://example.com/support' },
      { kind: 'PRIVACY', url: 'https://example.com/privacy' },
    ])
  })

  it.each([
    'http://example.com/support',
    'https://user:password@example.com/support',
    'https://example.com/support#private',
    'javascript:alert(1)',
  ])('rejects an unsafe product resource URL: %s', (url) => {
    expect(() =>
      productResourceLinks({
        privacyPolicyUrl: null,
        supportUrl: url,
      }),
    ).toThrow('Product resource links must use public HTTPS URLs')
  })
})
