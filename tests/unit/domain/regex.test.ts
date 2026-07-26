import { describe, expect, it } from 'vitest'

import {
  canonicalizeFlags,
  MAX_PATTERN_LENGTH,
  matchesRegex,
  validateRegex,
} from '../../../src/domain/regex/validate'
import { generateRuleTemplate, type RuleTemplateId } from '../../../src/domain/rules/templates'

describe('regular expression validation', () => {
  it('defaults to case-insensitive matching', () => {
    expect(validateRegex('^HTTPS://EXAMPLE\\.COM/$')).toEqual({
      ok: true,
      value: { flags: 'i', pattern: '^HTTPS://EXAMPLE\\.COM/$' },
    })
  })

  it.each(['g', 'y', 's', 'u', 'v', 'd'])('rejects unsupported flag %s', (flag) => {
    expect(canonicalizeFlags(flag)).toEqual({
      error: { code: 'UNSUPPORTED_FLAG', detail: flag },
      ok: false,
    })
  })

  it('canonicalizes the safe flag subset', () => {
    expect(canonicalizeFlags('mi')).toEqual({ ok: true, value: 'im' })
    expect(canonicalizeFlags('ii').ok).toBe(false)
  })

  it.each([
    ['(a+)+$', 'UNSAFE_PATTERN'],
    ['(a)\\1', 'BACKREFERENCE_UNSUPPORTED'],
    ['[', 'INVALID_SYNTAX'],
    ['x'.repeat(MAX_PATTERN_LENGTH + 1), 'PATTERN_TOO_LONG'],
  ])('rejects unsafe input', (pattern, code) => {
    const result = validateRegex(pattern)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(code)
    }
  })

  it('tests without stateful regex behavior', () => {
    expect(matchesRegex('https://example.com/', 'example', 'i')).toEqual({
      ok: true,
      value: true,
    })
  })
})

describe('rule templates', () => {
  const cases: readonly [RuleTemplateId, Parameters<typeof generateRuleTemplate>[1], string][] = [
    ['EXACT_HOSTNAME', { hostname: 'example.com' }, 'https://example.com/'],
    ['DOMAIN_AND_SUBDOMAINS', { hostname: 'example.com' }, 'https://a.example.com/'],
    ['EXACT_ORIGIN', { hostname: 'example.com', scheme: 'https' }, 'https://example.com/'],
    ['HTTP_ONLY', {}, 'http://example.com/'],
    ['HTTPS_ONLY', {}, 'https://example.com/'],
    ['CUSTOM_PORT', { hostname: 'example.com', port: 8443 }, 'https://example.com:8443/'],
    ['LOCALHOST', {}, 'http://localhost:3000/'],
    ['PRIVATE_IPV4', {}, 'http://192.168.1.20/'],
    [
      'FIREFOX_URL_PATH',
      { hostname: 'example.com', path: '/admin' },
      'https://example.com/admin/users',
    ],
    ['FIREFOX_QUERY_PARAMETER', { queryParameter: 'token' }, 'https://example.com/?token=1'],
  ]

  it.each(cases)('generates safe %s expressions', (id, input, target) => {
    const generated = generateRuleTemplate(id, input)
    expect(validateRegex(generated.pattern, generated.flags).ok).toBe(true)
    expect(new RegExp(generated.pattern, generated.flags).test(target)).toBe(true)
  })
})
