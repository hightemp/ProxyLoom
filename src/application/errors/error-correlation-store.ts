import { normalizeUrl } from '../../domain/url/normalize'
import type { BrowserPlatform, Clock } from '../../domain/types/entities'
import type { ProxyProfileId, RuleId } from '../../domain/types/brand'
import { err, ok, type Result } from '../../domain/types/result'

export interface ErrorContext {
  readonly token: string
  readonly tabId: number
  readonly incognito: boolean
  readonly requestId: string
  readonly hostname: string
  readonly technicalCode: string
  readonly profileId: ProxyProfileId | null
  readonly profileName: string | null
  readonly ruleId: RuleId | null
  readonly ruleName: string | null
  readonly platform: BrowserPlatform
  readonly occurredAt: string
}

export interface StoredErrorContext {
  readonly context: ErrorContext
  readonly originalUrl: string
  readonly expiresAt: number
}

export interface ErrorContextStatePort {
  mutateErrorContexts<T>(
    mutation: (contexts: readonly StoredErrorContext[]) => {
      readonly contexts: readonly StoredErrorContext[]
      readonly value: T
    },
  ): Promise<T>
}

export type ErrorContextError =
  { readonly code: 'INVALID_URL' } | { readonly code: 'CONTEXT_NOT_FOUND' | 'CONTEXT_EXPIRED' }

export class ErrorCorrelationStore {
  constructor(
    private readonly clock: Clock,
    private readonly token: () => string,
    private readonly state: ErrorContextStatePort,
    private readonly ttlMs = 5 * 60_000,
    private readonly maximumEntries = 100,
  ) {}

  async record(input: {
    readonly tabId: number
    readonly incognito: boolean
    readonly requestId: string
    readonly url: string
    readonly technicalCode: string
    readonly profileId: ProxyProfileId | null
    readonly profileName: string | null
    readonly ruleId: RuleId | null
    readonly ruleName: string | null
    readonly platform: BrowserPlatform
  }): Promise<Result<ErrorContext, ErrorContextError>> {
    const normalized = normalizeUrl(input.url)
    if (!normalized.ok) {
      return err({ code: 'INVALID_URL' })
    }
    return this.state.mutateErrorContexts<Result<ErrorContext, ErrorContextError>>(
      (storedContexts) => {
        const now = this.clock.now()
        const token = this.token()
        const context: ErrorContext = {
          hostname: normalized.value.hostname,
          incognito: input.incognito,
          occurredAt: now.toISOString(),
          platform: input.platform,
          profileId: input.profileId,
          profileName: input.profileName,
          requestId: input.requestId,
          ruleId: input.ruleId,
          ruleName: input.ruleName,
          tabId: input.tabId,
          technicalCode: input.technicalCode,
          token,
        }
        const active = storedContexts.filter(
          (stored) => stored.expiresAt > now.getTime() && stored.context.token !== token,
        )
        const contexts = [
          ...active,
          {
            context,
            expiresAt: now.getTime() + this.ttlMs,
            originalUrl: input.url,
          },
        ].slice(-this.maximumEntries)
        return { contexts, value: ok(context) }
      },
    )
  }

  get(token: string): Promise<Result<ErrorContext, ErrorContextError>> {
    return this.state.mutateErrorContexts<Result<ErrorContext, ErrorContextError>>((contexts) => {
      const stored = contexts.find((candidate) => candidate.context.token === token)
      const now = this.clock.now().getTime()
      const active = contexts.filter((candidate) => candidate.expiresAt > now)
      const retained = active.length === contexts.length ? contexts : active
      if (stored === undefined) {
        return { contexts: retained, value: err({ code: 'CONTEXT_NOT_FOUND' }) }
      }
      if (stored.expiresAt <= now) {
        return { contexts: retained, value: err({ code: 'CONTEXT_EXPIRED' }) }
      }
      return { contexts: retained, value: ok(stored.context) }
    })
  }

  consumeRetry(
    token: string,
  ): Promise<
    Result<{ readonly context: ErrorContext; readonly originalUrl: string }, ErrorContextError>
  > {
    return this.state.mutateErrorContexts<
      Result<{ readonly context: ErrorContext; readonly originalUrl: string }, ErrorContextError>
    >((contexts) => {
      const stored = contexts.find((candidate) => candidate.context.token === token)
      if (stored === undefined) {
        return { contexts, value: err({ code: 'CONTEXT_NOT_FOUND' }) }
      }
      const now = this.clock.now().getTime()
      if (stored.expiresAt <= now) {
        return {
          contexts: contexts.filter((candidate) => candidate.expiresAt > now),
          value: err({ code: 'CONTEXT_EXPIRED' }),
        }
      }
      return {
        contexts: contexts.filter(
          (candidate) => candidate.context.token !== token && candidate.expiresAt > now,
        ),
        value: ok({ context: stored.context, originalUrl: stored.originalUrl }),
      }
    })
  }

  clearTab(tabId: number): Promise<void> {
    return this.state.mutateErrorContexts((contexts) => {
      const retained = contexts.filter((stored) => stored.context.tabId !== tabId)
      return {
        contexts: retained.length === contexts.length ? contexts : retained,
        value: undefined,
      }
    })
  }

  sweep(): Promise<void> {
    return this.state.mutateErrorContexts((contexts) => {
      const now = this.clock.now().getTime()
      const active = contexts.filter((stored) => stored.expiresAt > now)
      return {
        contexts: active.length === contexts.length ? contexts : active,
        value: undefined,
      }
    })
  }

  size(): Promise<number> {
    return this.state.mutateErrorContexts((contexts) => {
      const now = this.clock.now().getTime()
      const active = contexts.filter((stored) => stored.expiresAt > now)
      return {
        contexts: active.length === contexts.length ? contexts : active,
        value: active.length,
      }
    })
  }
}
