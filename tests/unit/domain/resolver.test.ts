import { describe, expect, it } from 'vitest'

import { asIsoTimestamp, asProxyProfileId } from '../../../src/domain/types/brand'
import type { AppConfig } from '../../../src/domain/types/entities'
import { resolveRoute } from '../../../src/domain/routing/resolver'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { config, override, profile, rule } from './fixtures'

const now = new Date('2026-01-01T12:00:00.000Z')

const resolve = (
  value: AppConfig,
  options: {
    readonly url?: string
    readonly platform?: 'CHROMIUM' | 'FIREFOX'
    readonly tabId?: number | null
    readonly overrides?: ReturnType<typeof override>[]
  } = {},
) => {
  const snapshot = buildRoutingSnapshot(value, options.overrides ?? [], now)
  expect(snapshot.ok).toBe(true)
  if (!snapshot.ok) {
    throw new Error(snapshot.error.code)
  }
  return resolveRoute(snapshot.value, {
    incognito: false,
    now,
    platform: options.platform ?? 'CHROMIUM',
    tabId: options.tabId ?? 1,
    url: options.url ?? 'https://example.com/path?q=1',
  })
}

describe('pure route resolver', () => {
  it('makes DIRECT an emergency mode that ignores overrides and rules', () => {
    const proxy = profile('global')
    const decision = resolve(
      config({
        general: {
          ...config().general,
          activeProxyProfileId: proxy.id,
          mode: 'DIRECT',
        },
        profiles: [proxy],
        rules: [
          rule('proxy-rule', 0, {
            action: {
              targetProxyProfileId: proxy.id,
              type: 'PROXY',
            },
          }),
        ],
      }),
      {
        overrides: [
          override({
            action: {
              targetProxyProfileId: proxy.id,
              type: 'PROXY',
            },
          }),
        ],
      },
    )
    expect(decision).toMatchObject({
      action: 'DIRECT',
      matchedOverrideId: null,
      matchedRuleId: null,
      source: 'MODE',
    })
  })

  it('uses the first matching rule in PROXY mode before global fallback', () => {
    const global = profile('global')
    const selected = profile('selected')
    const value = config({
      general: {
        ...config().general,
        activeProxyProfileId: global.id,
        mode: 'PROXY',
      },
      profiles: [global, selected],
      rules: [
        rule('first', 0, {
          action: {
            targetProxyProfileId: selected.id,
            type: 'PROXY',
          },
        }),
        rule('second', 1),
      ],
    })
    expect(resolve(value)).toMatchObject({
      action: 'PROXY',
      matchedRuleId: 'first',
      profileId: 'selected',
      source: 'RULE',
    })
  })

  it('uses the global proxy only when PROXY mode has no matching rule', () => {
    const global = profile('global')
    const decision = resolve(
      config({
        general: {
          ...config().general,
          activeProxyProfileId: global.id,
          mode: 'PROXY',
        },
        profiles: [global],
        rules: [rule('miss', 0, { pattern: '^https://other\\.example/$' })],
      }),
    )
    expect(decision).toMatchObject({
      action: 'PROXY',
      profileId: 'global',
      source: 'FALLBACK',
    })
  })

  it('uses DIRECT only as the explicit RULES fallback', () => {
    expect(resolve(config())).toMatchObject({
      action: 'DIRECT',
      source: 'FALLBACK',
    })
  })

  it('skips disabled and temporarily disabled rules', () => {
    const value = config({
      rules: [
        rule('disabled', 0, { enabled: false }),
        rule('temporary', 1, {
          temporaryDisable: {
            kind: 'UNTIL',
            until: asIsoTimestamp('2026-01-01T13:00:00.000Z'),
          },
        }),
        rule('match', 2),
      ],
    })
    const decision = resolve(value)
    expect(decision.matchedRuleId).toBe('match')
    expect(decision.trace.map((entry) => entry.status)).toEqual([
      'DISABLED',
      'TEMPORARILY_DISABLED',
      'MATCHED',
    ])
  })

  it('clears an expired temporary disable in the snapshot', () => {
    const value = config({
      rules: [
        rule('expired', 0, {
          temporaryDisable: {
            kind: 'UNTIL',
            until: asIsoTimestamp('2026-01-01T11:00:00.000Z'),
          },
        }),
      ],
    })
    expect(resolve(value).matchedRuleId).toBe('expired')
  })

  it('executes Full URL rules only in Firefox', () => {
    const fullUrlRule = rule('full', 0, {
      matcherType: 'FULL_URL',
      pattern: '^https://example\\.com/path\\?q=1$',
    })
    const value = config({ rules: [fullUrlRule] })
    expect(resolve(value).matchedRuleId).toBeNull()
    expect(resolve(value, { platform: 'FIREFOX' }).matchedRuleId).toBe('full')
  })

  it('returns a configuration error for a matched deleted profile reference', () => {
    const decision = resolve(
      config({
        rules: [
          rule('invalid', 0, {
            action: {
              targetProxyProfileId: asProxyProfileId('deleted'),
              type: 'PROXY',
            },
            validity: 'INVALID_REFERENCE',
          }),
        ],
      }),
    )
    expect(decision).toMatchObject({
      action: 'CONFIG_ERROR',
      errorCode: 'PROXY_PROFILE_NOT_FOUND',
      matchedRuleId: 'invalid',
    })
  })

  it('applies a Firefox tab override only to its source tab', () => {
    const once = override({ platformScope: 'TAB', sourceTabId: 7 })
    expect(
      resolve(config(), {
        overrides: [once],
        platform: 'FIREFOX',
        tabId: 7,
      }).source,
    ).toBe('OVERRIDE')
    expect(
      resolve(config(), {
        overrides: [once],
        platform: 'FIREFOX',
        tabId: 8,
      }).source,
    ).toBe('FALLBACK')
  })

  it('applies a Chromium origin override across tabs', () => {
    const once = override({ platformScope: 'ORIGIN', sourceTabId: 7 })
    expect(
      resolve(config(), {
        overrides: [once],
        platform: 'CHROMIUM',
        tabId: 8,
      }).source,
    ).toBe('OVERRIDE')
  })

  it('chooses separate endpoints for target schemes', () => {
    const global = profile('global')
    const value = config({
      general: {
        ...config().general,
        activeProxyProfileId: global.id,
        mode: 'PROXY',
      },
      profiles: [global],
    })
    expect(resolve(value, { url: 'http://example.com/' }).endpoint?.port).toBe(8080)
    expect(resolve(value, { url: 'ws://example.com/' }).endpoint?.port).toBe(8080)
    expect(resolve(value, { url: 'https://example.com/' }).endpoint?.port).toBe(8443)
    expect(resolve(value, { url: 'wss://example.com/' }).endpoint?.port).toBe(8443)
  })
})

describe('routing snapshot validation', () => {
  it('rejects PROXY mode without an active profile', () => {
    const result = buildRoutingSnapshot(
      config({ general: { ...config().general, mode: 'PROXY' } }),
      [],
      now,
    )
    expect(result).toEqual({
      error: { code: 'ACTIVE_PROFILE_REQUIRED', profileId: null },
      ok: false,
    })
  })

  it('produces a deterministic hash for the same inputs', () => {
    const value = config()
    expect(buildRoutingSnapshot(value, [], now)).toEqual(buildRoutingSnapshot(value, [], now))
  })
})
