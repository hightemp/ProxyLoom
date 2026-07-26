import { z } from 'zod'

import type { RuleDisableRecord, SessionStatePort } from '../../application/ports/session-state'
import type { TemporaryOverride } from '../../domain/types/entities'
import type { StorageArea } from '../config/storage-area'

const OVERRIDES_KEY = 'session.overrides'
const DISABLES_KEY = 'session.rule-disables'
const TRANSIENT_KEY = 'session.transient'

export interface TransientState {
  readonly authAttempts: Readonly<Record<string, number>>
  readonly proxyCheckRecoveryRevision: number | null
}

const EMPTY_TRANSIENT: TransientState = {
  authAttempts: {},
  proxyCheckRecoveryRevision: null,
}

const timestamp = z.string().datetime({ offset: true })
const actionSchema = z
  .object({
    targetProxyProfileId: z.string().min(1).max(128).nullable(),
    type: z.enum(['DIRECT', 'PROXY']),
  })
  .strict()
const overrideSchema = z
  .object({
    action: actionSchema,
    createdAt: timestamp,
    expiresOnTabClose: z.literal(true),
    generatedPattern: z.string().min(1).max(2_048),
    id: z.string().min(1).max(128),
    incognito: z.boolean(),
    originKey: z.string().min(1).max(2_048),
    platformScope: z.enum(['TAB', 'ORIGIN']),
    scope: z.enum(['EXACT_HOSTNAME', 'REGISTRABLE_DOMAIN']),
    sourceTabId: z.number().int().nonnegative(),
  })
  .strict()
const disableSchema = z
  .object({
    ruleId: z.string().min(1).max(128),
    state: z
      .object({
        kind: z.enum(['UNTIL', 'UNTIL_RESTART']),
        until: timestamp.nullable(),
      })
      .strict(),
  })
  .strict()
const transientSchema = z
  .object({
    authAttempts: z.record(z.string(), z.number().finite().nonnegative()),
    proxyCheckRecoveryRevision: z.number().int().nonnegative().nullable(),
  })
  .strict()

export class SessionRepository implements SessionStatePort {
  constructor(private readonly storage: StorageArea) {}

  async getOverrides(): Promise<readonly TemporaryOverride[]> {
    const values = await this.storage.get([OVERRIDES_KEY])
    const parsed = z.array(overrideSchema).safeParse(values[OVERRIDES_KEY])
    return parsed.success ? (parsed.data as unknown as TemporaryOverride[]) : []
  }

  async setOverrides(overrides: readonly TemporaryOverride[]): Promise<void> {
    await this.storage.set({ [OVERRIDES_KEY]: overrides })
  }

  async getRuleDisables(): Promise<readonly RuleDisableRecord[]> {
    const values = await this.storage.get([DISABLES_KEY])
    const parsed = z.array(disableSchema).safeParse(values[DISABLES_KEY])
    return parsed.success ? (parsed.data as unknown as RuleDisableRecord[]) : []
  }

  async setRuleDisables(disables: readonly RuleDisableRecord[]): Promise<void> {
    await this.storage.set({ [DISABLES_KEY]: disables })
  }

  async getTransientState(): Promise<TransientState> {
    const values = await this.storage.get([TRANSIENT_KEY])
    const parsed = transientSchema.safeParse(values[TRANSIENT_KEY])
    return parsed.success ? parsed.data : EMPTY_TRANSIENT
  }

  async setTransientState(state: TransientState): Promise<void> {
    await this.storage.set({ [TRANSIENT_KEY]: state })
  }

  async clear(): Promise<void> {
    await this.storage.remove([OVERRIDES_KEY, DISABLES_KEY, TRANSIENT_KEY])
  }

  async reconcile(
    liveTabIds: ReadonlySet<number>,
    now: Date,
    browserRestart: boolean,
  ): Promise<{ overrides: readonly TemporaryOverride[]; disables: readonly RuleDisableRecord[] }> {
    const [overrides, disables] = await Promise.all([this.getOverrides(), this.getRuleDisables()])
    const reconciledOverrides = overrides.filter((override) => liveTabIds.has(override.sourceTabId))
    const reconciledDisables = disables.filter((record) => {
      if (record.state.kind === 'UNTIL_RESTART') {
        return !browserRestart
      }
      return record.state.until !== null && Date.parse(record.state.until) > now.getTime()
    })
    await Promise.all([
      this.setOverrides(reconciledOverrides),
      this.setRuleDisables(reconciledDisables),
    ])
    return {
      disables: reconciledDisables,
      overrides: reconciledOverrides,
    }
  }

  async removeOverridesForTab(tabId: number): Promise<readonly TemporaryOverride[]> {
    const overrides = await this.getOverrides()
    const retained = overrides.filter((override) => override.sourceTabId !== tabId)
    await this.setOverrides(retained)
    return retained
  }
}
