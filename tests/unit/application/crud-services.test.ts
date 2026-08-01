import { describe, expect, it } from 'vitest'

import { GeneralSettingsService } from '../../../src/application/config/general-settings-service'
import { ProfileApplicationService } from '../../../src/application/profiles/profile-service'
import { RuleApplicationService } from '../../../src/application/rules/rule-service'
import { asProxyProfileId, asRuleId, type IdGenerator } from '../../../src/domain/types/brand'
import type { Clock, ProxyProfile, Rule } from '../../../src/domain/types/entities'
import { config, endpoint, profile, rule } from '../domain/fixtures'

class SequenceIds implements IdGenerator {
  #index = 0

  constructor(private readonly values: readonly string[]) {}

  next(): string {
    const value = this.values[this.#index]
    if (value === undefined) {
      throw new Error('No deterministic ID remains.')
    }
    this.#index += 1
    return value
  }
}

const clock: Clock = {
  now: () => new Date('2026-02-01T00:00:00.000Z'),
}

const editableProfile = (
  overrides: Partial<
    Omit<ProxyProfile, 'id' | 'createdAt' | 'updatedAt' | 'generatedShortName' | 'lastCheck'>
  > = {},
) => ({
  checkUrl: 'https://api.country.is/',
  color: '#3154D5',
  httpEndpoint: endpoint('proxy.example', 8080),
  httpsEndpoint: endpoint('secure-proxy.example', 8443, 'HTTPS'),
  name: 'Office proxy',
  note: '',
  shortName: null,
  useSameProxy: false,
  ...overrides,
})

const editableRule = (
  overrides: Partial<
    Omit<Rule, 'id' | 'createdAt' | 'updatedAt' | 'position' | 'validity' | 'temporaryDisable'>
  > = {},
) => ({
  action: { targetProxyProfileId: null, type: 'DIRECT' as const },
  description: '',
  enabled: true,
  flags: 'i',
  matcherType: 'ORIGIN' as const,
  name: 'Example',
  pattern: '^https://example\\.com/$',
  ...overrides,
})

describe('profile application service', () => {
  it('creates, updates, duplicates, and validates profiles', () => {
    const service = new ProfileApplicationService(
      new SequenceIds(['profile-new', 'profile-copy']),
      clock,
    )
    const created = service.create(config(), editableProfile())
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }
    expect(created.value.profile).toMatchObject({
      generatedShortName: 'OP',
      id: 'profile-new',
      lastCheck: null,
    })

    const updated = service.update(
      created.value.config,
      created.value.profile.id,
      editableProfile({ name: 'Main office' }),
    )
    expect(updated).toMatchObject({
      ok: true,
      value: { profile: { generatedShortName: 'MO', name: 'Main office' } },
    })
    const duplicated = service.duplicate(created.value.config, created.value.profile.id)
    expect(duplicated).toMatchObject({
      ok: true,
      value: { profile: { id: 'profile-copy', lastCheck: null, name: 'Office proxy copy' } },
    })
    expect(
      service.create(config(), editableProfile({ httpEndpoint: endpoint('bad host', 8080) })),
    ).toMatchObject({
      error: { code: 'PROFILE_INVALID', field: 'httpEndpoint.host' },
      ok: false,
    })
  })

  it('reports delete impact and preserves referring rules as invalid', () => {
    const service = new ProfileApplicationService(new SequenceIds([]), clock)
    const used = profile('used')
    const value = config({
      general: {
        ...config().general,
        activeProxyProfileId: used.id,
        mode: 'PROXY',
      },
      profiles: [used],
      rules: [
        rule('uses-profile', 0, {
          action: { targetProxyProfileId: used.id, type: 'PROXY' },
        }),
      ],
    })

    expect(service.delete(value, used.id, false)).toMatchObject({
      error: { code: 'CONFIRMATION_REQUIRED' },
      ok: false,
    })
    const deleted = service.delete(value, used.id, true)
    expect(deleted).toMatchObject({
      ok: true,
      value: {
        config: {
          general: { activeProxyProfileId: null, mode: 'DIRECT' },
          profiles: [],
          rules: [{ validity: 'INVALID_REFERENCE' }],
        },
        impact: { activeGlobally: true, referringRuleIds: ['uses-profile'] },
      },
    })
  })
})

describe('rule application service', () => {
  it('keeps one global order across create, duplicate, reorder, and delete', () => {
    const rules = new RuleApplicationService(new SequenceIds(['created', 'duplicated']), clock)
    const initial = config({ rules: [rule('existing', 0)] })
    const created = rules.create(initial, editableRule({ name: 'Created' }))
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }
    const duplicated = rules.duplicate(created.value.config, created.value.rule.id)
    expect(duplicated.ok).toBe(true)
    if (!duplicated.ok) {
      return
    }
    expect(duplicated.value.config.rules.map((candidate) => candidate.id)).toEqual([
      'existing',
      'created',
      'duplicated',
    ])
    expect(rules.reorder(duplicated.value.config, duplicated.value.rule.id, 0, true)).toMatchObject(
      {
        error: { code: 'FILTERED_REORDER_FORBIDDEN' },
        ok: false,
      },
    )
    const moved = rules.reorder(duplicated.value.config, duplicated.value.rule.id, 0, false)
    expect(moved.ok && moved.value.config.rules.map((candidate) => candidate.id)).toEqual([
      'duplicated',
      'existing',
      'created',
    ])
    if (!moved.ok) {
      return
    }
    const middleRule = moved.value.config.rules[1]
    expect(middleRule).toBeDefined()
    if (middleRule === undefined) {
      return
    }
    expect(rules.delete(moved.value.config, middleRule.id)).toMatchObject({ ok: true })
  })

  it('returns typed failures for invalid rule mutations', () => {
    const rules = new RuleApplicationService(new SequenceIds(['invalid']), clock)
    expect(rules.create(config(), editableRule({ name: '' }))).toMatchObject({
      error: { code: 'RULE_INVALID', field: 'name' },
      ok: false,
    })
    expect(rules.update(config(), asRuleId('missing'), editableRule())).toEqual({
      error: { code: 'RULE_NOT_FOUND', ruleId: 'missing' },
      ok: false,
    })
    expect(rules.duplicate(config(), asRuleId('missing'))).toEqual({
      error: { code: 'RULE_NOT_FOUND', ruleId: 'missing' },
      ok: false,
    })
    expect(rules.delete(config(), asRuleId('missing'))).toEqual({
      error: { code: 'RULE_NOT_FOUND', ruleId: 'missing' },
      ok: false,
    })
    expect(rules.setEnabled(config(), asRuleId('missing'), false)).toEqual({
      error: { code: 'RULE_NOT_FOUND', ruleId: 'missing' },
      ok: false,
    })
    expect(rules.reorder(config({ rules: [rule('one', 0)] }), asRuleId('one'), 4, false)).toEqual({
      error: { code: 'POSITION_OUT_OF_RANGE' },
      ok: false,
    })
    expect(
      rules.reorder(config({ rules: [rule('one', 0)] }), asRuleId('missing'), 0, false),
    ).toEqual({
      error: { code: 'RULE_NOT_FOUND', ruleId: 'missing' },
      ok: false,
    })
  })

  it('updates enabled state and refreshes reference validity without changing priority', () => {
    const rules = new RuleApplicationService(new SequenceIds([]), clock)
    const existing = rule('existing', 0)
    const value = config({ rules: [existing] })
    const updated = rules.update(
      value,
      existing.id,
      editableRule({ description: 'Updated', name: 'Updated rule' }),
    )
    expect(updated).toMatchObject({
      ok: true,
      value: { rule: { description: 'Updated', position: 0 } },
    })
    expect(rules.setEnabled(value, existing.id, false)).toMatchObject({
      ok: true,
      value: { config: { rules: [{ enabled: false, position: 0 }] } },
    })
    const missingProfile = asProxyProfileId('deleted')
    expect(
      rules.refreshValidity(
        config({
          rules: [
            rule('invalid-reference', 0, {
              action: { targetProxyProfileId: missingProfile, type: 'PROXY' },
            }),
          ],
        }),
      ).rules[0],
    ).toMatchObject({ position: 0, validity: 'INVALID_REFERENCE' })
  })
})

describe('general settings application service', () => {
  it('prevents an unassigned PROXY mode and makes Use Globally explicit', () => {
    const service = new GeneralSettingsService()
    expect(service.setMode(config(), 'PROXY')).toEqual({
      error: { code: 'ACTIVE_PROFILE_REQUIRED' },
      ok: false,
    })
    const configured = config({ profiles: [profile('global')] })
    expect(service.useProfileGlobally(configured, asProxyProfileId('global'))).toMatchObject({
      ok: true,
      value: {
        general: { activeProxyProfileId: 'global', mode: 'PROXY' },
      },
    })
    expect(service.useProfileGlobally(configured, asProxyProfileId('missing'))).toEqual({
      error: { code: 'PROFILE_NOT_FOUND', profileId: 'missing' },
      ok: false,
    })
    expect(service.setMode(configured, 'RULES')).toMatchObject({
      ok: true,
      value: { general: { mode: 'RULES' } },
    })
    expect(
      service.updateAppearance(configured, {
        theme: 'DARK',
      }),
    ).toMatchObject({ appearance: { theme: 'DARK' } })
    expect(
      service.updateGeneral(configured, {
        ...configured.general,
        loggingPaused: true,
      }),
    ).toMatchObject({ general: { loggingPaused: true } })
  })
})
