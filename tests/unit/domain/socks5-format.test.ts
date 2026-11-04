import { describe, expect, it } from 'vitest'

import { validateProxyProfile } from '../../../src/domain/profiles/profile'
import {
  formatProxyCompact,
  formatProxyCurl,
  formatProxyUrl,
} from '../../../src/domain/profiles/proxy-format'
import { parseProxyString } from '../../../src/domain/profiles/proxy-string'
import { endpoint, profile } from './fixtures'

const socks = { ...endpoint('proxy.example', 1080, 'SOCKS5'), password: 'p@ss', username: 'u' }

describe('SOCKS5 text formats (PL-145)', () => {
  it('writes socks5h URLs, which state proxy-side DNS, and reads them back', () => {
    expect(formatProxyUrl(socks)).toBe('socks5h://u:p%40ss@proxy.example:1080')
    expect(parseProxyString(formatProxyUrl(socks))).toEqual({
      kind: 'SUCCESS',
      proxy: {
        host: 'proxy.example',
        password: 'p@ss',
        port: 1080,
        transport: 'SOCKS5',
        username: 'u',
      },
    })
  })

  it('writes a compact line with a socks5 word that parses back', () => {
    const anonymous = endpoint('192.0.2.10', 1080, 'SOCKS5')
    expect(formatProxyCompact(anonymous)).toBe('192.0.2.10:1080 socks5')
    expect(parseProxyString('192.0.2.10:1080 socks5')).toMatchObject({
      proxy: { transport: 'SOCKS5' },
    })
  })

  it('builds a curl command that resolves names through the proxy', () => {
    expect(formatProxyCurl(socks, 'https://example.com/')).toBe(
      "curl -x 'socks5h://u:p%40ss@proxy.example:1080' 'https://example.com/'",
    )
  })

  it('accepts a SOCKS5 profile in validation', () => {
    expect(validateProxyProfile(profile('s', { httpEndpoint: socks, useSameProxy: true })).ok).toBe(
      true,
    )
  })
})
