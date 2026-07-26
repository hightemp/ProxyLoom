import type { Rule } from '../types/entities'
import { err, ok, type Result } from '../types/result'

export interface MoveRuleCommand {
  readonly ruleId: Rule['id']
  readonly toIndex: number
  readonly filteredViewActive: boolean
}

export type ReorderError = 'FILTERED_VIEW' | 'RULE_NOT_FOUND' | 'INDEX_OUT_OF_RANGE'

export const sortRules = (rules: readonly Rule[]): readonly Rule[] =>
  [...rules].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  )

export const moveRule = (
  rules: readonly Rule[],
  command: MoveRuleCommand,
): Result<readonly Rule[], ReorderError> => {
  if (command.filteredViewActive) {
    return err('FILTERED_VIEW')
  }
  if (command.toIndex < 0 || command.toIndex >= rules.length) {
    return err('INDEX_OUT_OF_RANGE')
  }

  const ordered = [...sortRules(rules)]
  const fromIndex = ordered.findIndex((rule) => rule.id === command.ruleId)
  if (fromIndex < 0) {
    return err('RULE_NOT_FOUND')
  }

  const [moved] = ordered.splice(fromIndex, 1)
  if (moved === undefined) {
    return err('RULE_NOT_FOUND')
  }
  ordered.splice(command.toIndex, 0, moved)

  return ok(
    ordered.map((rule, position) => (rule.position === position ? rule : { ...rule, position })),
  )
}
