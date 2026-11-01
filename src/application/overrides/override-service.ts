import { validateOverride } from '../../domain/rules/validate'
import {
  asIsoTimestamp,
  asTemporaryOverrideId,
  type IdGenerator,
  type TemporaryOverrideId,
} from '../../domain/types/brand'
import type {
  AppConfig,
  BrowserPlatform,
  Clock,
  OverrideScope,
  RuleAction,
  TemporaryOverride,
} from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'
import { normalizeUrl } from '../../domain/url/normalize'
import { registrableDomain } from '../../domain/url/registrable-domain'
import type { SessionStatePort } from '../ports/session-state'

export type OverrideCommandError =
  | {
      readonly code:
        | 'INVALID_URL'
        | 'DOMAIN_SCOPE_UNAVAILABLE'
        | 'PROFILE_NOT_FOUND'
        | 'INVALID_TAB'
        | 'INVALID_OVERRIDE'
    }
  | { readonly code: 'OVERRIDE_NOT_FOUND'; readonly overrideId: string }

export interface OverridePreview {
  readonly originKey: string
  readonly generatedPattern: string
  readonly platformScope: 'TAB' | 'ORIGIN'
  readonly chromiumScopeWarning: boolean
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hostnamePattern = (hostname: string): string => {
  const escaped = escapeRegex(hostname)
  return `^(?:https?|wss?)://${escaped}(?::\\d+)?/$`
}

const domainPattern = (domain: string): string => {
  const escaped = escapeRegex(domain)
  return `^(?:https?|wss?)://(?:[^./]+\\.)*${escaped}(?::\\d+)?/$`
}

/** The single generator of Once patterns; the service and the UI preview both use it. */
export const previewOverrideForHostname = (
  hostname: string,
  scope: OverrideScope,
  platform: BrowserPlatform,
): Result<OverridePreview, OverrideCommandError> => {
  let originKey: string
  let generatedPattern: string
  if (scope === 'EXACT_HOSTNAME') {
    originKey = hostname
    generatedPattern = hostnamePattern(hostname)
  } else {
    const domain = registrableDomain(hostname)
    if (!domain.ok) {
      return err({ code: 'DOMAIN_SCOPE_UNAVAILABLE' })
    }
    originKey = domain.value
    generatedPattern = domainPattern(domain.value)
  }
  return ok({
    chromiumScopeWarning: platform === 'CHROMIUM',
    generatedPattern,
    originKey,
    platformScope: platform === 'FIREFOX' ? 'TAB' : 'ORIGIN',
  })
}

export class OverrideApplicationService {
  constructor(
    private readonly session: SessionStatePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  preview(
    url: string,
    scope: OverrideScope,
    platform: BrowserPlatform,
  ): Result<OverridePreview, OverrideCommandError> {
    const normalized = normalizeUrl(url)
    if (!normalized.ok) {
      return err({ code: 'INVALID_URL' })
    }
    return previewOverrideForHostname(normalized.value.hostname, scope, platform)
  }

  async create(
    config: AppConfig,
    input: {
      readonly url: string
      readonly tabId: number
      readonly incognito: boolean
      readonly scope: OverrideScope
      readonly action: RuleAction
      readonly platform: BrowserPlatform
    },
  ): Promise<Result<TemporaryOverride, OverrideCommandError>> {
    if (!Number.isInteger(input.tabId) || input.tabId < 0) {
      return err({ code: 'INVALID_TAB' })
    }
    if (
      input.action.type === 'PROXY' &&
      (input.action.targetProxyProfileId === null ||
        !config.profiles.some((profile) => profile.id === input.action.targetProxyProfileId))
    ) {
      return err({ code: 'PROFILE_NOT_FOUND' })
    }
    const normalized = normalizeUrl(input.url)
    if (!normalized.ok) {
      return err({ code: 'INVALID_URL' })
    }
    const preview = previewOverrideForHostname(
      normalized.value.hostname,
      input.scope,
      input.platform,
    )
    if (!preview.ok) {
      return preview
    }
    const candidate: TemporaryOverride = {
      action: input.action,
      createdAt: asIsoTimestamp(this.clock.now().toISOString()),
      expiresOnTabClose: true,
      generatedPattern: preview.value.generatedPattern,
      id: asTemporaryOverrideId(this.ids.next()),
      incognito: input.incognito,
      originKey: preview.value.originKey,
      platformScope: preview.value.platformScope,
      scope: input.scope,
      sourceHostname: normalized.value.hostname,
      sourceTabId: input.tabId,
    }
    const validated = validateOverride(
      candidate,
      new Set(config.profiles.map((profile) => profile.id)),
    )
    if (!validated.ok) {
      return err({ code: 'INVALID_OVERRIDE' })
    }
    const current = await this.session.getOverrides()
    const withoutSameScope = current.filter(
      (override) =>
        !(
          override.sourceTabId === candidate.sourceTabId &&
          override.incognito === candidate.incognito &&
          override.originKey === candidate.originKey
        ),
    )
    await this.session.setOverrides([...withoutSameScope, candidate])
    return ok(candidate)
  }

  /** Overrides of one session only; normal and private overrides never mix (FR-058). */
  async list(incognito: boolean): Promise<readonly TemporaryOverride[]> {
    return (await this.session.getOverrides()).filter(
      (override) => override.incognito === incognito,
    )
  }

  async update(
    config: AppConfig,
    input: {
      readonly overrideId: TemporaryOverrideId
      readonly incognito: boolean
      readonly platform: BrowserPlatform
      readonly scope?: OverrideScope
      readonly action?: RuleAction
    },
  ): Promise<Result<TemporaryOverride, OverrideCommandError>> {
    const current = await this.session.getOverrides()
    const existing = current.find(
      (override) => override.id === input.overrideId && override.incognito === input.incognito,
    )
    if (existing === undefined) {
      return err({ code: 'OVERRIDE_NOT_FOUND', overrideId: input.overrideId })
    }
    const action = input.action ?? existing.action
    if (
      action.type === 'PROXY' &&
      (action.targetProxyProfileId === null ||
        !config.profiles.some((profile) => profile.id === action.targetProxyProfileId))
    ) {
      return err({ code: 'PROFILE_NOT_FOUND' })
    }
    const scope = input.scope ?? existing.scope
    const preview = previewOverrideForHostname(existing.sourceHostname, scope, input.platform)
    if (!preview.ok) {
      return preview
    }
    const candidate: TemporaryOverride = {
      ...existing,
      action,
      generatedPattern: preview.value.generatedPattern,
      originKey: preview.value.originKey,
      platformScope: preview.value.platformScope,
      scope,
    }
    const validated = validateOverride(
      candidate,
      new Set(config.profiles.map((profile) => profile.id)),
    )
    if (!validated.ok) {
      return err({ code: 'INVALID_OVERRIDE' })
    }
    await this.session.setOverrides(
      current.map((override) => (override.id === candidate.id ? candidate : override)),
    )
    return ok(candidate)
  }

  /** Data for an equivalent permanent Origin Rule; the caller commits it before removal. */
  async promotion(
    overrideId: TemporaryOverrideId,
    incognito: boolean,
  ): Promise<
    Result<
      { readonly action: RuleAction; readonly originKey: string; readonly pattern: string },
      OverrideCommandError
    >
  > {
    const existing = (await this.list(incognito)).find((override) => override.id === overrideId)
    if (existing === undefined) {
      return err({ code: 'OVERRIDE_NOT_FOUND', overrideId })
    }
    return ok({
      action: existing.action,
      originKey: existing.originKey,
      pattern: existing.generatedPattern,
    })
  }

  async remove(
    overrideId: TemporaryOverrideId,
    incognito: boolean,
  ): Promise<Result<null, OverrideCommandError>> {
    const current = await this.session.getOverrides()
    if (
      !current.some((override) => override.id === overrideId && override.incognito === incognito)
    ) {
      return err({ code: 'OVERRIDE_NOT_FOUND', overrideId })
    }
    await this.session.setOverrides(current.filter((override) => override.id !== overrideId))
    return ok(null)
  }

  async clear(incognito: boolean): Promise<{ readonly removed: number }> {
    const current = await this.session.getOverrides()
    const retained = current.filter((override) => override.incognito !== incognito)
    if (retained.length !== current.length) await this.session.setOverrides(retained)
    return { removed: current.length - retained.length }
  }

  /** Drops overrides whose proxy profile no longer exists (PRD §20 Invalid → cleanup). */
  async removeInvalid(config: AppConfig): Promise<{ readonly removed: number }> {
    const profileIds = new Set(config.profiles.map((profile) => profile.id))
    const current = await this.session.getOverrides()
    const valid = current.filter((override) => validateOverride(override, profileIds).ok)
    if (valid.length !== current.length) await this.session.setOverrides(valid)
    return { removed: current.length - valid.length }
  }
}
