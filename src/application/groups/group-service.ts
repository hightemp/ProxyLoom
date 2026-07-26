import { asRuleGroupId, type IdGenerator, type RuleGroupId } from '../../domain/types/brand'
import type { AppConfig, RuleGroup } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'
import { validateGroup } from '../../domain/rules/validate'

export type GroupCommandError =
  | { readonly code: 'GROUP_NOT_FOUND' | 'DESTINATION_GROUP_NOT_FOUND'; readonly groupId: string }
  | { readonly code: 'GROUP_INVALID'; readonly field: string }
  | { readonly code: 'CONFIRMATION_REQUIRED'; readonly groupId: string }

export class GroupApplicationService {
  constructor(private readonly ids: IdGenerator) {}

  create(
    config: AppConfig,
    name: string,
  ): Result<{ config: AppConfig; group: RuleGroup }, GroupCommandError> {
    const candidate: RuleGroup = {
      id: asRuleGroupId(this.ids.next()),
      isPreset: false,
      name,
      position: config.groups.length,
    }
    const validated = validateGroup(candidate)
    if (!validated.ok) {
      return err({ code: 'GROUP_INVALID', field: validated.error.field })
    }
    return ok({
      config: { ...config, groups: [...config.groups, candidate] },
      group: candidate,
    })
  }

  rename(
    config: AppConfig,
    groupId: RuleGroupId,
    name: string,
  ): Result<{ config: AppConfig }, GroupCommandError> {
    const current = config.groups.find((group) => group.id === groupId)
    if (current === undefined) {
      return err({ code: 'GROUP_NOT_FOUND', groupId })
    }
    const candidate = { ...current, name }
    const validated = validateGroup(candidate)
    if (!validated.ok) {
      return err({ code: 'GROUP_INVALID', field: validated.error.field })
    }
    return ok({
      config: {
        ...config,
        groups: config.groups.map((group) => (group.id === groupId ? candidate : group)),
      },
    })
  }

  delete(
    config: AppConfig,
    groupId: RuleGroupId,
    destinationGroupId: RuleGroupId | null,
    confirmed: boolean,
  ): Result<{ config: AppConfig }, GroupCommandError> {
    if (!config.groups.some((group) => group.id === groupId)) {
      return err({ code: 'GROUP_NOT_FOUND', groupId })
    }
    const hasRules = config.rules.some((rule) => rule.groupId === groupId)
    if (hasRules && !confirmed) {
      return err({ code: 'CONFIRMATION_REQUIRED', groupId })
    }
    if (
      hasRules &&
      (destinationGroupId === null ||
        destinationGroupId === groupId ||
        !config.groups.some((group) => group.id === destinationGroupId))
    ) {
      return err({
        code: 'DESTINATION_GROUP_NOT_FOUND',
        groupId: destinationGroupId ?? groupId,
      })
    }
    const retainedGroups = config.groups
      .filter((group) => group.id !== groupId)
      .map((group, position) => ({ ...group, position }))
    return ok({
      config: {
        ...config,
        groups: retainedGroups,
        rules: config.rules.map((rule) =>
          rule.groupId === groupId && destinationGroupId !== null
            ? { ...rule, groupId: destinationGroupId }
            : rule,
        ),
      },
    })
  }
}
