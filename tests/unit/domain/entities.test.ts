import { describe, expect, it } from 'vitest'

import { asIsoTimestamp, asProxyProfileId, asRuleId } from '../../../src/domain/types/brand'
import { EMPTY_RULE_FILTERS, filterRules } from '../../../src/domain/rules/filters'
import {
  deriveRuleValidity,
  validateOverride,
  validateRule,
} from '../../../src/domain/rules/validate'
import { override, profile, rule } from './fixtures'

describe('branded primitives and entity invariants', () => {
  it('rejects non-portable IDs and non-canonical timestamps', () => {
    expect(() => asProxyProfileId('')).toThrow(TypeError)
    expect(() => asRuleId('contains spaces')).toThrow(TypeError)
    expect(() => asIsoTimestamp('2026-01-01')).toThrow(TypeError)
    expect(asIsoTimestamp('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z')
  })

  it('validates action and reference invariants', () => {
    const proxy = profile('proxy-1')
    const references = {
      profileIds: new Set([proxy.id]),
    }
    expect(
      validateRule(
        rule('valid', 0, {
          action: { targetProxyProfileId: proxy.id, type: 'PROXY' },
        }),
        references,
      ).ok,
    ).toBe(true)
    expect(
      validateRule(
        rule('bad-direct', 0, {
          action: { targetProxyProfileId: proxy.id, type: 'DIRECT' },
        }),
        references,
      ),
    ).toMatchObject({ error: { code: 'DIRECT_PROFILE_FORBIDDEN' }, ok: false })
    expect(
      deriveRuleValidity(
        rule('missing', 0, {
          action: { targetProxyProfileId: asProxyProfileId('missing'), type: 'PROXY' },
        }),
        references,
      ),
    ).toBe('INVALID_REFERENCE')
    expect(deriveRuleValidity(rule('bad-pattern', 0, { pattern: '(a+)+' }), references)).toBe(
      'INVALID_PATTERN',
    )
  })

  it('validates temporary overrides', () => {
    expect(validateOverride(override(), new Set()).ok).toBe(true)
    expect(
      validateOverride(
        override({
          action: { targetProxyProfileId: asProxyProfileId('missing'), type: 'PROXY' },
        }),
        new Set(),
      ),
    ).toMatchObject({ error: { code: 'PROXY_PROFILE_NOT_FOUND' }, ok: false })
  })
})

describe('rule filters', () => {
  const proxy = profile('proxy-1')
  const rules = [
    rule('alpha', 1, { description: 'work route', enabled: false }),
    rule('beta', 0, {
      action: { targetProxyProfileId: proxy.id, type: 'PROXY' },
      matcherType: 'FULL_URL',
      pattern: '^https://example\\.com/private',
    }),
  ]

  it('combines filters while preserving global order', () => {
    expect(
      filterRules(rules, {
        ...EMPTY_RULE_FILTERS,
        action: 'PROXY',
        compatibility: 'FIREFOX',
        profileId: proxy.id,
        query: 'private',
      }).map((candidate) => candidate.id),
    ).toEqual(['beta'])
    expect(filterRules(rules, EMPTY_RULE_FILTERS).map((candidate) => candidate.id)).toEqual([
      'beta',
      'alpha',
    ])
  })

  it('excludes Firefox-only rules from a Chromium compatibility view', () => {
    expect(
      filterRules(rules, { ...EMPTY_RULE_FILTERS, compatibility: 'CHROMIUM' }).map(
        (candidate) => candidate.id,
      ),
    ).toEqual(['alpha'])
  })
})
