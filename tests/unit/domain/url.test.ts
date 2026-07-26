import { describe, expect, it } from 'vitest'

import {
  endpointTargetForScheme,
  normalizeFullUrl,
  normalizeOrigin,
  normalizeUrl,
} from '../../../src/domain/url/normalize'
import { registrableDomain } from '../../../src/domain/url/registrable-domain'

describe('URL normalization', () => {
  it.each([
    ['HTTPS://Example.COM/path?q=1#part', 'https://example.com/'],
    ['http://user:secret@example.com:8080/a', 'http://example.com:8080/'],
    ['https://münich.example/path', 'https://xn--mnich-kva.example/'],
    ['ws://socket.example.com/chat', 'ws://socket.example.com/'],
    ['wss://socket.example.com:443/chat', 'wss://socket.example.com/'],
    ['http://[::1]:8080/a', 'http://[::1]:8080/'],
  ])('normalizes %s as an origin', (input, expected) => {
    expect(normalizeOrigin(input)).toEqual({ ok: true, value: expected })
  })

  it('keeps path and query but removes credentials and fragment for full URL rules', () => {
    expect(normalizeFullUrl('https://user:secret@Example.com:443/a%20b?q=1#fragment')).toEqual({
      ok: true,
      value: 'https://example.com/a%20b?q=1',
    })
  })

  it.each(['chrome://settings/', 'file:///tmp/a', 'not a URL'])(
    'rejects unsupported or invalid input %s',
    (input) => {
      expect(normalizeUrl(input).ok).toBe(false)
    },
  )

  it('maps target schemes to endpoint slots', () => {
    expect(endpointTargetForScheme('http')).toBe('HTTP')
    expect(endpointTargetForScheme('ws')).toBe('HTTP')
    expect(endpointTargetForScheme('https')).toBe('HTTPS')
    expect(endpointTargetForScheme('wss')).toBe('HTTPS')
  })
})

describe('registrable domain extraction', () => {
  it.each([
    ['www.example.co.uk', 'example.co.uk'],
    ['a.b.github.io', 'b.github.io'],
    ['münich.example.com', 'example.com'],
  ])('extracts %s locally', (hostname, expected) => {
    expect(registrableDomain(hostname)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['localhost', 'LOCAL_HOSTNAME'],
    ['127.0.0.1', 'IP_ADDRESS'],
    ['[::1]', 'IP_ADDRESS'],
    ['co.uk', 'PUBLIC_SUFFIX'],
  ])('returns an explicit error for %s', (hostname, code) => {
    const result = registrableDomain(hostname)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(code)
    }
  })
})
