import type { RuleId } from '../../domain/types/brand'
import { asIsoTimestamp } from '../../domain/types/brand'
import type { AppConfig, Clock, TemporaryDisable } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'
import type { SessionStatePort } from '../ports/session-state'

/** Choices offered by FR-036. */
export type TemporaryDisableDuration = 'MINUTES_5' | 'MINUTES_15' | 'HOUR_1' | 'UNTIL_RESTART'

const DURATION_MS: Record<Exclude<TemporaryDisableDuration, 'UNTIL_RESTART'>, number> = {
  HOUR_1: 60 * 60_000,
  MINUTES_15: 15 * 60_000,
  MINUTES_5: 5 * 60_000,
}

export type RuleDisableError = { readonly code: 'RULE_NOT_FOUND'; readonly ruleId: string }

/** Session-only temporary disable; the rule's permanent `enabled` flag is never touched. */
export class RuleDisableService {
  constructor(
    private readonly session: SessionStatePort,
    private readonly clock: Clock,
  ) {}

  async set(
    config: AppConfig,
    ruleId: RuleId,
    duration: TemporaryDisableDuration,
  ): Promise<Result<TemporaryDisable, RuleDisableError>> {
    if (!config.rules.some((rule) => rule.id === ruleId)) {
      return err({ code: 'RULE_NOT_FOUND', ruleId })
    }
    const state: TemporaryDisable =
      duration === 'UNTIL_RESTART'
        ? { kind: 'UNTIL_RESTART', until: null }
        : {
            kind: 'UNTIL',
            until: asIsoTimestamp(
              new Date(this.clock.now().getTime() + DURATION_MS[duration]).toISOString(),
            ),
          }
    const others = await this.retained(config, ruleId)
    await this.session.setRuleDisables([...others, { ruleId, state }])
    return ok(state)
  }

  async clear(config: AppConfig, ruleId: RuleId): Promise<void> {
    await this.session.setRuleDisables(await this.retained(config, ruleId))
  }

  /** Records for other existing rules; records of deleted rules are dropped on the way. */
  private async retained(config: AppConfig, ruleId: RuleId) {
    const existing = new Set(config.rules.map((rule) => rule.id))
    return (await this.session.getRuleDisables()).filter(
      (record) => record.ruleId !== ruleId && existing.has(record.ruleId),
    )
  }
}
