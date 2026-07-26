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

interface StoredErrorContext {
  readonly context: ErrorContext
  readonly originalUrl: string
  readonly expiresAt: number
}

export type ErrorContextError =
  { readonly code: 'INVALID_URL' } | { readonly code: 'CONTEXT_NOT_FOUND' | 'CONTEXT_EXPIRED' }

export class ErrorCorrelationStore {
  readonly #contexts = new Map<string, StoredErrorContext>()

  constructor(
    private readonly clock: Clock,
    private readonly token: () => string,
    private readonly ttlMs = 5 * 60_000,
    private readonly maximumEntries = 100,
  ) {}

  record(input: {
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
  }): Result<ErrorContext, ErrorContextError> {
    const normalized = normalizeUrl(input.url)
    if (!normalized.ok) {
      return err({ code: 'INVALID_URL' })
    }
    this.sweep()
    while (this.#contexts.size >= this.maximumEntries) {
      const oldest = this.#contexts.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.#contexts.delete(oldest)
    }
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
    this.#contexts.set(token, {
      context,
      expiresAt: now.getTime() + this.ttlMs,
      originalUrl: input.url,
    })
    return ok(context)
  }

  get(token: string): Result<ErrorContext, ErrorContextError> {
    const stored = this.#contexts.get(token)
    if (stored === undefined) {
      return err({ code: 'CONTEXT_NOT_FOUND' })
    }
    if (stored.expiresAt <= this.clock.now().getTime()) {
      this.#contexts.delete(token)
      return err({ code: 'CONTEXT_EXPIRED' })
    }
    return ok(stored.context)
  }

  consumeRetryUrl(token: string): Result<string, ErrorContextError> {
    const context = this.get(token)
    if (!context.ok) {
      return context
    }
    const stored = this.#contexts.get(token)
    if (stored === undefined) {
      return err({ code: 'CONTEXT_NOT_FOUND' })
    }
    this.#contexts.delete(token)
    return ok(stored.originalUrl)
  }

  clearTab(tabId: number): void {
    for (const [token, stored] of this.#contexts) {
      if (stored.context.tabId === tabId) {
        this.#contexts.delete(token)
      }
    }
  }

  sweep(): void {
    const now = this.clock.now().getTime()
    for (const [token, stored] of this.#contexts) {
      if (stored.expiresAt <= now) {
        this.#contexts.delete(token)
      }
    }
  }

  get size(): number {
    this.sweep()
    return this.#contexts.size
  }
}
