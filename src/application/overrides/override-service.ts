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
    let originKey: string
    let generatedPattern: string
    if (scope === 'EXACT_HOSTNAME') {
      originKey = normalized.value.hostname
      generatedPattern = hostnamePattern(normalized.value.hostname)
    } else {
      const domain = registrableDomain(normalized.value.hostname)
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
    const preview = this.preview(input.url, input.scope, input.platform)
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

  async remove(overrideId: TemporaryOverrideId): Promise<Result<null, OverrideCommandError>> {
    const current = await this.session.getOverrides()
    if (!current.some((override) => override.id === overrideId)) {
      return err({ code: 'OVERRIDE_NOT_FOUND', overrideId })
    }
    await this.session.setOverrides(current.filter((override) => override.id !== overrideId))
    return ok(null)
  }

  async removeInvalid(config: AppConfig): Promise<readonly TemporaryOverride[]> {
    const profileIds = new Set(config.profiles.map((profile) => profile.id))
    const current = await this.session.getOverrides()
    const valid = current.filter((override) => validateOverride(override, profileIds).ok)
    await this.session.setOverrides(valid)
    return valid
  }
}
