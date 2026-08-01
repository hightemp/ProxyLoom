import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import { buildRoutingSnapshot } from '../../src/domain/routing/snapshot'
import { resolveRoute } from '../../src/domain/routing/resolver'
import { generateRuleTemplate } from '../../src/domain/rules/templates'
import { compilePac } from '../../src/platform/chromium/pac/compiler'
import { config, override, profile, rule } from '../unit/domain/fixtures'

const now = new Date('2026-01-01T12:00:00.000Z')

const evaluatePac = (script: string, url: string): string =>
  runInNewContext(
    `${script}\nFindProxyForURL(${JSON.stringify(url)}, ${JSON.stringify(new URL(url).hostname)});`,
    Object.create(null) as object,
    { timeout: 100 },
  ) as string

describe('resolver and generated PAC parity', () => {
  it('keeps two per-rule proxy selections distinct', () => {
    const proxy1 = profile('proxy-1', {
      httpEndpoint: { ...profile('proxy-1').httpEndpoint, port: 9001 },
    })
    const proxy2 = profile('proxy-2', {
      httpEndpoint: { ...profile('proxy-2').httpEndpoint, port: 9002 },
    })
    const russianSuffix = generateRuleTemplate('DOMAIN_SUFFIXES', { domainSuffixes: '.ru, .рф' })
    const germanSuffix = generateRuleTemplate('DOMAIN_SUFFIXES', { domainSuffixes: '.de' })
    const snapshot = buildRoutingSnapshot(
      config({
        profiles: [proxy1, proxy2],
        rules: [
          rule('russian', 0, {
            action: { targetProxyProfileId: proxy1.id, type: 'PROXY' },
            flags: russianSuffix.flags,
            pattern: russianSuffix.pattern,
          }),
          rule('german', 1, {
            action: { targetProxyProfileId: proxy2.id, type: 'PROXY' },
            flags: germanSuffix.flags,
            pattern: germanSuffix.pattern,
          }),
        ],
      }),
      [],
      now,
    )
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return
    const compiled = compilePac(snapshot.value)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return

    for (const [url, profileId, port] of [
      ['http://example.ru/', proxy1.id, proxy1.httpEndpoint.port],
      ['http://example.de/', proxy2.id, proxy2.httpEndpoint.port],
    ] as const) {
      const decision = resolveRoute(snapshot.value, {
        incognito: false,
        now,
        platform: 'CHROMIUM',
        tabId: 1,
        url,
      })
      expect(decision).toMatchObject({ action: 'PROXY', profileId, source: 'RULE' })
      expect(evaluatePac(compiled.value.script, url)).toBe(`PROXY 127.0.0.1:${String(port)}`)
    }
  })

  it('returns the same direct/proxy decisions for routes and schemes', () => {
    const global = profile('global')
    const special = profile('special')
    const value = config({
      general: {
        ...config().general,
        activeProxyProfileId: global.id,
        mode: 'PROXY',
      },
      profiles: [global, special],
      rules: [
        rule('special', 0, {
          action: {
            targetProxyProfileId: special.id,
            type: 'PROXY',
          },
          pattern: '^https://special\\.example/$',
        }),
        rule('direct', 1, {
          pattern: '^https://direct\\.example/$',
        }),
      ],
    })
    const snapshot = buildRoutingSnapshot(
      value,
      [
        override({
          generatedPattern: '^https://override\\.example/$',
        }),
      ],
      now,
    )
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }
    const compiled = compilePac(snapshot.value)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) {
      return
    }

    const urls = [
      'https://special.example/path',
      'https://direct.example/',
      'https://override.example/',
      'https://fallback.example/',
      'http://fallback.example/',
      'ws://fallback.example/socket',
      'wss://fallback.example/socket',
    ]

    for (const url of urls) {
      const decision = resolveRoute(snapshot.value, {
        incognito: false,
        now,
        platform: 'CHROMIUM',
        tabId: 1,
        url,
      })
      const pacResult = evaluatePac(compiled.value.script, url)
      if (decision.action === 'DIRECT') {
        expect(pacResult, url).toBe('DIRECT')
      } else {
        expect(decision.action, url).toBe('PROXY')
        const expectedKeyword = decision.endpoint?.transport === 'HTTPS' ? 'HTTPS' : 'PROXY'
        expect(pacResult, url).toBe(
          `${expectedKeyword} ${decision.endpoint?.host}:${decision.endpoint?.port}`,
        )
        expect(pacResult, url).not.toContain(';')
        expect(pacResult, url).not.toContain('DIRECT')
      }
    }
  })

  it('serializes hostile pattern text without executing it', () => {
    const injected = rule('injected', 0, {
      pattern: "^https://safe\\.example/'; throw new Error('injected') //",
    })
    const snapshot = buildRoutingSnapshot(config({ rules: [injected] }), [], now)
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }
    const compiled = compilePac(snapshot.value)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) {
      return
    }
    expect(() => evaluatePac(compiled.value.script, 'https://other.example/')).not.toThrow()
  })

  it('keeps a deterministic fuzz corpus inert across PAC serialization', () => {
    let seed = 0x5eed1234
    const next = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
      return seed
    }
    const alphabet = ['a', "'", '"', '\\', '/', '<', '>', ';', '{', '}', '\n', '\u2028', '\u2029']
    const escapeRegex = (value: string): string =>
      value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replaceAll('/', '\\/')

    for (let index = 0; index < 256; index += 1) {
      const value = Array.from(
        { length: 1 + (next() % 48) },
        () => alphabet[next() % alphabet.length],
      ).join('')
      const fuzzRule = rule(`fuzz-${String(index)}`, 0, {
        pattern: `^https://fuzz\\.example/${escapeRegex(value)}$`,
      })
      const snapshot = buildRoutingSnapshot(config({ rules: [fuzzRule] }), [], now)
      expect(snapshot.ok, `snapshot ${String(index)}`).toBe(true)
      if (!snapshot.ok) continue
      const compiled = compilePac(snapshot.value)
      expect(compiled.ok, `compile ${String(index)}`).toBe(true)
      if (!compiled.ok) continue
      expect(() => evaluatePac(compiled.value.script, 'https://other.example/')).not.toThrow()
    }
  })

  it('rejects an invalid profile reference instead of compiling a fallback', () => {
    const invalid = rule('invalid', 0, {
      validity: 'INVALID_REFERENCE',
    })
    const snapshot = buildRoutingSnapshot(config({ rules: [invalid] }), [], now)
    expect(snapshot.ok).toBe(true)
    if (snapshot.ok) {
      expect(compilePac(snapshot.value)).toEqual({
        error: { code: 'INVALID_RULE', entityId: 'invalid' },
        ok: false,
      })
    }
  })
})
