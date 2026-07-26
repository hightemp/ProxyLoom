import { describe, expect, it } from 'vitest'

import { isSupportedProxyFailure } from '../../../src/application/errors/proxy-failure-classifier'

describe('proxy failure classifier', () => {
  it.each([
    'net::ERR_PROXY_CONNECTION_FAILED',
    'net::ERR_TUNNEL_CONNECTION_FAILED',
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_EMPTY_RESPONSE',
    'net::ERR_TIMED_OUT',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_INVALID_AUTH_CREDENTIALS',
  ])('accepts supported explicit and best-effort transport failures: %s', (error) => {
    expect(isSupportedProxyFailure(error)).toBe(true)
  })

  it.each(['net::ERR_ABORTED', 'net::ERR_BLOCKED_BY_CLIENT', 'net::ERR_NAME_NOT_RESOLVED'])(
    'does not redirect unrelated or ambiguous failures: %s',
    (error) => {
      expect(isSupportedProxyFailure(error)).toBe(false)
    },
  )
})
