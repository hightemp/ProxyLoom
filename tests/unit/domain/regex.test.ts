import { describe, expect, it } from 'vitest'

import {
  canonicalizeFlags,
  MAX_PATTERN_LENGTH,
  matchesRegex,
  validateRegex,
} from '../../../src/domain/regex/validate'
import {
  generateRuleTemplate,
  NAMED_RULE_TEMPLATE_PRESETS,
  SOCIAL_NETWORK_DOMAINS,
  type RuleTemplateId,
} from '../../../src/domain/rules/templates'

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

  it('does not treat escaped quantifiers or character classes as nested repetition', () => {
    expect(validateRegex('^(?:a\\+)+$').ok).toBe(true)
    expect(validateRegex('^(?:[+*])+$').ok).toBe(true)
  })

  it.each([
    ['(a+)+$', 'UNSAFE_PATTERN'],
    ['(?:foo|foobar)+$', 'UNSAFE_PATTERN'],
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
    ['DOMAIN_SUFFIXES', { domainSuffixes: '.ru, .рф, .de' }, 'https://sub.example.xn--p1ai/'],
    ['RUSSIAN_DOMAINS', {}, 'https://sub.example.xn--p1ai/'],
    ['SOCIAL_NETWORKS', {}, 'https://www.instagram.com/'],
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

  it('matches only explicitly entered domain suffixes after IDN normalization', () => {
    const generated = generateRuleTemplate('DOMAIN_SUFFIXES', {
      domainSuffixes: '.ru, рф, de, .ru',
    })
    const expression = new RegExp(generated.pattern, generated.flags)

    expect(expression.test('https://example.ru/')).toBe(true)
    expect(expression.test('wss://sub.example.ru:8443/')).toBe(true)
    expect(expression.test('https://example.xn--p1ai/')).toBe(true)
    expect(expression.test('https://example.de/')).toBe(true)
    expect(expression.test('https://example.ru.com/')).toBe(false)
    expect(expression.test('https://notru/')).toBe(false)
  })

  it.each(['', '., ,', 'ru/path', 'ru:443', '-ru'])(
    'rejects invalid domain suffix list %s',
    (value) => {
      expect(() => generateRuleTemplate('DOMAIN_SUFFIXES', { domainSuffixes: value })).toThrow()
    },
  )

  it('fills the Russian Sites example with Russian country-code domains only', () => {
    const generated = generateRuleTemplate('RUSSIAN_DOMAINS')
    const expression = new RegExp(generated.pattern, generated.flags)

    expect(NAMED_RULE_TEMPLATE_PRESETS.RUSSIAN_DOMAINS?.name).toBe('Russian Sites example')
    expect(expression.test('https://yandex.ru/')).toBe(true)
    expect(expression.test('https://sub.example.su/')).toBe(true)
    expect(expression.test('https://xn--e1afmkfd.xn--p1ai/')).toBe(true)
    expect(expression.test('https://example.ru.com/')).toBe(false)
    expect(expression.test('https://belarus.by/')).toBe(false)
  })

  it('fills the Social Networks example with exact base domains and their subdomains', () => {
    const generated = generateRuleTemplate('SOCIAL_NETWORKS')
    const expression = new RegExp(generated.pattern, generated.flags)

    expect(NAMED_RULE_TEMPLATE_PRESETS.SOCIAL_NETWORKS?.name).toBe('Social Networks example')
    for (const domain of SOCIAL_NETWORK_DOMAINS) {
      expect(expression.test(`https://${domain}/`), domain).toBe(true)
      expect(expression.test(`wss://api.${domain}:443/`), `api.${domain}`).toBe(true)
    }
    expect(expression.test('https://notfacebook.com/')).toBe(false)
    expect(expression.test('https://facebook.com.example/')).toBe(false)
  })
})
