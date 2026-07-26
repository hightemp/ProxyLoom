import { moveRule, sortRules } from '../../domain/rules/order'
import { deriveRuleValidity, validateRule } from '../../domain/rules/validate'
import { asIsoTimestamp, asRuleId, type IdGenerator, type RuleId } from '../../domain/types/brand'
import type { AppConfig, Clock, Rule } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'

export type EditableRule = Omit<
  Rule,
  'id' | 'createdAt' | 'updatedAt' | 'position' | 'validity' | 'temporaryDisable'
>

export type RuleCommandError =
  | { readonly code: 'RULE_NOT_FOUND'; readonly ruleId: string }
  | { readonly code: 'RULE_INVALID'; readonly field: string; readonly validationCode: string }
  | { readonly code: 'FILTERED_REORDER_FORBIDDEN' | 'POSITION_OUT_OF_RANGE' }

const referencesFor = (config: AppConfig) => ({
  groupIds: new Set(config.groups.map((group) => group.id)),
  profileIds: new Set(config.profiles.map((profile) => profile.id)),
})

export class RuleApplicationService {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  create(
    config: AppConfig,
    input: EditableRule,
  ): Result<{ config: AppConfig; rule: Rule }, RuleCommandError> {
    const timestamp = asIsoTimestamp(this.clock.now().toISOString())
    const candidate: Rule = {
      ...input,
      createdAt: timestamp,
      id: asRuleId(this.ids.next()),
      position: config.rules.length,
      temporaryDisable: null,
      updatedAt: timestamp,
      validity: 'VALID',
    }
    const validated = validateRule(candidate, referencesFor(config))
    if (!validated.ok) {
      return err({
        code: 'RULE_INVALID',
        field: validated.error.field,
        validationCode: validated.error.code,
      })
    }
    return ok({
      config: { ...config, rules: [...sortRules(config.rules), candidate] },
      rule: candidate,
    })
  }

  update(
    config: AppConfig,
    ruleId: RuleId,
    input: EditableRule,
  ): Result<{ config: AppConfig; rule: Rule }, RuleCommandError> {
    const current = config.rules.find((rule) => rule.id === ruleId)
    if (current === undefined) {
      return err({ code: 'RULE_NOT_FOUND', ruleId })
    }
    const candidate: Rule = {
      ...current,
      ...input,
      updatedAt: asIsoTimestamp(this.clock.now().toISOString()),
    }
    const validated = validateRule(candidate, referencesFor(config))
    if (!validated.ok) {
      return err({
        code: 'RULE_INVALID',
        field: validated.error.field,
        validationCode: validated.error.code,
      })
    }
    return ok({
      config: {
        ...config,
        rules: config.rules.map((rule) => (rule.id === ruleId ? candidate : rule)),
      },
      rule: candidate,
    })
  }

  duplicate(
    config: AppConfig,
    ruleId: RuleId,
  ): Result<{ config: AppConfig; rule: Rule }, RuleCommandError> {
    const current = config.rules.find((rule) => rule.id === ruleId)
    if (current === undefined) {
      return err({ code: 'RULE_NOT_FOUND', ruleId })
    }
    const created = this.create(config, {
      action: current.action,
      description: current.description,
      enabled: current.enabled,
      flags: current.flags,
      groupId: current.groupId,
      matcherType: current.matcherType,
      name: `${current.name} copy`,
      pattern: current.pattern,
    })
    if (!created.ok) {
      return created
    }
    const sourcePosition = sortRules(config.rules).findIndex((rule) => rule.id === ruleId)
    const moved = moveRule(created.value.config.rules, {
      filteredViewActive: false,
      ruleId: created.value.rule.id,
      toIndex: sourcePosition + 1,
    })
    return moved.ok
      ? ok({
          config: { ...created.value.config, rules: moved.value },
          rule: moved.value.find((rule) => rule.id === created.value.rule.id) ?? created.value.rule,
        })
      : created
  }

  delete(config: AppConfig, ruleId: RuleId): Result<{ config: AppConfig }, RuleCommandError> {
    if (!config.rules.some((rule) => rule.id === ruleId)) {
      return err({ code: 'RULE_NOT_FOUND', ruleId })
    }
    return ok({
      config: {
        ...config,
        rules: sortRules(config.rules)
          .filter((rule) => rule.id !== ruleId)
          .map((rule, position) => ({ ...rule, position })),
      },
    })
  }

  setEnabled(
    config: AppConfig,
    ruleId: RuleId,
    enabled: boolean,
  ): Result<{ config: AppConfig }, RuleCommandError> {
    const current = config.rules.find((rule) => rule.id === ruleId)
    if (current === undefined) {
      return err({ code: 'RULE_NOT_FOUND', ruleId })
    }
    const timestamp = asIsoTimestamp(this.clock.now().toISOString())
    return ok({
      config: {
        ...config,
        rules: config.rules.map((rule) =>
          rule.id === ruleId ? { ...rule, enabled, updatedAt: timestamp } : rule,
        ),
      },
    })
  }

  reorder(
    config: AppConfig,
    ruleId: RuleId,
    toPosition: number,
    filtersActive: boolean,
  ): Result<{ config: AppConfig }, RuleCommandError> {
    const moved = moveRule(config.rules, {
      filteredViewActive: filtersActive,
      ruleId,
      toIndex: toPosition,
    })
    if (!moved.ok) {
      if (moved.error === 'FILTERED_VIEW') {
        return err({ code: 'FILTERED_REORDER_FORBIDDEN' })
      }
      if (moved.error === 'INDEX_OUT_OF_RANGE') {
        return err({ code: 'POSITION_OUT_OF_RANGE' })
      }
      return err({ code: 'RULE_NOT_FOUND', ruleId })
    }
    return ok({ config: { ...config, rules: moved.value } })
  }

  refreshValidity(config: AppConfig): AppConfig {
    const references = referencesFor(config)
    return {
      ...config,
      rules: config.rules.map((rule) => ({
        ...rule,
        validity: deriveRuleValidity(rule, references),
      })),
    }
  }
}
