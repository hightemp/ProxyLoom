import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import { resolveRoute } from '../../src/domain/routing/resolver'
import { buildRoutingSnapshot } from '../../src/domain/routing/snapshot'
import { compilePac } from '../../src/platform/chromium/pac/compiler'
import { config, endpoint, profile, rule } from '../unit/domain/fixtures'

const now = new Date('2026-01-01T12:00:00.000Z')

const evaluatePac = (script: string, url: string): string =>
  runInNewContext(
    `${script}\nFindProxyForURL(${JSON.stringify(url)}, ${JSON.stringify(new URL(url).hostname)});`,
    Object.create(null) as object,
    { timeout: 100 },
  ) as string

const socks = profile('socks', {
  httpEndpoint: {
    ...endpoint('socks.example', 1080, 'SOCKS5'),
    password: 'synthetic-socks-password',
    username: 'synthetic-socks-user',
  },
  httpsEndpoint: endpoint('[2001:db8::5]', 1081, 'SOCKS5'),
  useSameProxy: false,
})

describe('SOCKS5 PAC directive (ADR-016)', () => {
  const snapshot = buildRoutingSnapshot(
    config({
      profiles: [socks],
      rules: [
        rule('all', 0, {
          action: { targetProxyProfileId: socks.id, type: 'PROXY' },
          pattern: '^(?:https?|wss?)://[^/]+/$',
        }),
      ],
    }),
    [],
    now,
  )
  if (!snapshot.ok) throw new Error(snapshot.error.code)
  const compiled = compilePac(snapshot.value)
  if (!compiled.ok) throw new Error(compiled.error.code)

  it.each([
    ['http://site.example/', 'SOCKS5 socks.example:1080'],
    ['ws://site.example/', 'SOCKS5 socks.example:1080'],
    ['https://site.example/', 'SOCKS5 [2001:db8::5]:1081'],
    ['wss://site.example/', 'SOCKS5 [2001:db8::5]:1081'],
  ])('routes %s to exactly %s with no fallback entry', (url, directive) => {
    expect(evaluatePac(compiled.value.script, url)).toBe(directive)
    const decision = resolveRoute(snapshot.value, {
      incognito: false,
      now,
      platform: 'CHROMIUM',
      tabId: 1,
      url,
    })
    expect(decision).toMatchObject({ action: 'PROXY', profileId: socks.id })
    expect(`SOCKS5 ${decision.endpoint?.host}:${decision.endpoint?.port}`).toBe(directive)
  })

  it('never writes SOCKS5 credentials or userinfo into the PAC script', () => {
    expect(compiled.value.script).not.toContain('synthetic-socks-user')
    expect(compiled.value.script).not.toContain('synthetic-socks-password')
    expect(compiled.value.script).not.toMatch(/SOCKS5 [^"]*@/)
  })

  it('golden: emits the SOCKS5 keyword only from the compiler-owned directive', () => {
    expect(compiled.value.script).toContain('"httpDirective":"SOCKS5 socks.example:1080"')
    expect(compiled.value.script).toContain('"httpsDirective":"SOCKS5 [2001:db8::5]:1081"')
  })
})
