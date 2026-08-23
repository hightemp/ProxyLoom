import { z } from 'zod'

import type {
  ErrorContextStatePort,
  StoredErrorContext,
} from '../../application/errors/error-correlation-store'
import type { RuleDisableRecord, SessionStatePort } from '../../application/ports/session-state'
import type { TemporaryOverride } from '../../domain/types/entities'
import type { StorageArea } from '../config/storage-area'

const OVERRIDES_KEY = 'session.overrides'
const DISABLES_KEY = 'session.rule-disables'
const TRANSIENT_KEY = 'session.transient'
export const ERROR_CONTEXTS_KEY = 'session.error-contexts'
const ERROR_CONTEXTS_SCHEMA_VERSION = 1

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

const errorContextSchema = z
  .object({
    context: z
      .object({
        hostname: z.string(),
        incognito: z.boolean(),
        occurredAt: timestamp,
        platform: z.enum(['CHROMIUM', 'FIREFOX']),
        profileId: z.string().nullable(),
        profileName: z.string().nullable(),
        requestId: z.string(),
        ruleId: z.string().nullable(),
        ruleName: z.string().nullable(),
        tabId: z.number().int().nonnegative(),
        technicalCode: z.string(),
        token: z.string().min(1),
      })
      .strict(),
    expiresAt: z.number().finite().nonnegative(),
    originalUrl: z.string(),
  })
  .strict()
const errorContextsEnvelopeSchema = z
  .object({
    contexts: z.array(errorContextSchema).max(100),
    schemaVersion: z.literal(ERROR_CONTEXTS_SCHEMA_VERSION),
  })
  .strict()

export class SessionRepository implements SessionStatePort, ErrorContextStatePort {
  #errorContextQueue = Promise.resolve()

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

  async getErrorContexts(): Promise<readonly StoredErrorContext[]> {
    return this.runErrorContextExclusive(() => this.readErrorContexts())
  }

  async setErrorContexts(contexts: readonly StoredErrorContext[]): Promise<void> {
    await this.runErrorContextExclusive(() => this.writeErrorContexts(contexts))
  }

  mutateErrorContexts<T>(
    mutation: (contexts: readonly StoredErrorContext[]) => {
      readonly contexts: readonly StoredErrorContext[]
      readonly value: T
    },
  ): Promise<T> {
    return this.runErrorContextExclusive(async () => {
      const contexts = await this.readErrorContexts()
      const result = mutation(contexts)
      if (result.contexts !== contexts) {
        await this.writeErrorContexts(result.contexts)
      }
      return result.value
    })
  }

  private async readErrorContexts(): Promise<readonly StoredErrorContext[]> {
    const values = await this.storage.get([ERROR_CONTEXTS_KEY])
    const parsed = errorContextsEnvelopeSchema.safeParse(values[ERROR_CONTEXTS_KEY])
    return parsed.success ? (parsed.data.contexts as readonly StoredErrorContext[]) : []
  }

  private async writeErrorContexts(contexts: readonly StoredErrorContext[]): Promise<void> {
    await this.storage.set({
      [ERROR_CONTEXTS_KEY]: {
        contexts,
        schemaVersion: ERROR_CONTEXTS_SCHEMA_VERSION,
      },
    })
  }

  private runErrorContextExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#errorContextQueue.then(operation, operation)
    this.#errorContextQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async clear(): Promise<void> {
    await this.storage.remove([OVERRIDES_KEY, DISABLES_KEY, TRANSIENT_KEY, ERROR_CONTEXTS_KEY])
  }

  async reconcileRouting(
    checkedTabIds: ReadonlySet<number>,
    liveTabIds: ReadonlySet<number>,
    now: Date,
    browserRestart: boolean,
  ): Promise<{ overrides: readonly TemporaryOverride[]; disables: readonly RuleDisableRecord[] }> {
    const [overrides, disables] = await Promise.all([this.getOverrides(), this.getRuleDisables()])
    const reconciledOverrides = overrides.filter(
      (override) =>
        !checkedTabIds.has(override.sourceTabId) || liveTabIds.has(override.sourceTabId),
    )
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

  async reconcileErrorContexts(
    liveTabIds: ReadonlySet<number>,
    now: Date,
    browserRestart: boolean,
  ): Promise<void> {
    await this.mutateErrorContexts((contexts) => {
      const retained = contexts.filter(
        (stored) =>
          liveTabIds.has(stored.context.tabId) &&
          stored.expiresAt > now.getTime() &&
          !browserRestart,
      )
      return {
        contexts: retained.length === contexts.length ? contexts : retained,
        value: undefined,
      }
    })
  }

  async removeOverridesForTab(tabId: number): Promise<readonly TemporaryOverride[]> {
    const overrides = await this.getOverrides()
    const retained = overrides.filter((override) => override.sourceTabId !== tabId)
    await this.setOverrides(retained)
    return retained
  }
}
