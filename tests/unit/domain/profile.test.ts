import { describe, expect, it } from 'vitest'

import {
  effectiveEndpoint,
  generateShortName,
  redactedProfile,
  validateProxyProfile,
} from '../../../src/domain/profiles/profile'
import { endpoint, profile } from './fixtures'

describe('proxy profiles', () => {
  it('validates every endpoint and visible field', () => {
    expect(validateProxyProfile(profile('work')).ok).toBe(true)
    expect(validateProxyProfile(profile('bad', { httpEndpoint: endpoint('bad host') })).ok).toBe(
      false,
    )
    expect(validateProxyProfile(profile('bad', { shortName: 'TOO-LONG' })).ok).toBe(false)
  })

  it('selects separate target endpoints', () => {
    const value = profile('work')
    expect(effectiveEndpoint(value, 'HTTP').port).toBe(8080)
    expect(effectiveEndpoint(value, 'HTTPS').port).toBe(8443)
  })

  it('uses the HTTP endpoint when same proxy is enabled', () => {
    const value = profile('work', { useSameProxy: true })
    expect(effectiveEndpoint(value, 'HTTPS').port).toBe(8080)
  })

  it('generates a deterministic short name with collision handling', () => {
    expect(generateShortName('Work Proxy')).toBe('WP')
    expect(generateShortName('Work Proxy', new Set(['WP']))).toBe('WP2')
  })

  it('redacts credentials structurally', () => {
    const value = profile('profile', {
      httpEndpoint: {
        ...endpoint(),
        password: 'canary-password',
        username: 'alice',
      },
    })
    expect(JSON.stringify(redactedProfile(value))).not.toContain('canary-password')
    expect(JSON.stringify(redactedProfile(value))).not.toContain('alice')
  })
})
