import { browser, type Browser } from 'wxt/browser'

import { GeneralSettingsService } from '../../application/config/general-settings-service'
import type { ErrorCorrelationStore } from '../../application/errors/error-correlation-store'
import { GroupApplicationService } from '../../application/groups/group-service'
import { FoxyProxyImporter } from '../../application/import-export/foxyproxy/importer'
import { parseFoxyProxyExport } from '../../application/import-export/foxyproxy/parser'
import { nativeExportFilename, serializeNativeExport } from '../../application/import-export/export'
import { NativeImportService } from '../../application/import-export/import'
import { inspectTab } from '../../application/inspection/current-tab-inspection'
import type { LogQuery } from '../../application/logging/log-types'
import type { PrivateLogBuffer } from '../../application/logging/private-buffer'
import { IncognitoCapabilityService } from '../../application/incognito/incognito-capability-service'
import { OverrideApplicationService } from '../../application/overrides/override-service'
import type { ProxyPlatformAdapter } from '../../application/ports/proxy-platform'
import type { LogStorePort } from '../../application/ports/log-store'
import { ProfileApplicationService } from '../../application/profiles/profile-service'
import {
  ProxyCheckService,
  type ProxyCheckRequestPort,
} from '../../application/proxy-check/proxy-check-service'
import type {
  AppRuntimeState,
  RuntimeDiagnostics,
  RuntimeRequest,
  RuntimeResponse,
} from '../../application/runtime/contracts'
import { RuleApplicationService } from '../../application/rules/rule-service'
import { buildRoutingSnapshot } from '../../domain/routing/snapshot'
import {
  asIsoTimestamp,
  asProxyProfileId,
  asRuleGroupId,
  asRuleId,
  asTemporaryOverrideId,
} from '../../domain/types/brand'
import type { AppConfig } from '../../domain/types/entities'
import type { Result } from '../../domain/types/result'
import type { ConfigRepository } from '../../storage/config/config-repository'
import type { SessionRepository } from '../../storage/session/session-repository'
import { resolveTargetTab } from './target-tab'

interface RuntimeControllerOptions {
  readonly adapter: ProxyPlatformAdapter
  readonly configRepository: ConfigRepository
  readonly sessionRepository: SessionRepository
  readonly logs: LogStorePort
  readonly privateLogs: PrivateLogBuffer
  readonly errorStore: ErrorCorrelationStore
  readonly proxyCheckRequest: ProxyCheckRequestPort
  readonly applyConfiguration: () => Promise<void>
  readonly diagnostics: () => {
    readonly appliedRevision: number | null
    readonly appliedSnapshotHash: string | null
    readonly lastApplyError: string | null
  }
}

type ConfigTransform = (config: AppConfig) =>
  | Result<{ readonly config: AppConfig }, { readonly code: string }>
  | {
      readonly ok: true
      readonly value: { readonly config: AppConfig }
    }

const commandError = (error: unknown, fallbackCode = 'COMMAND_FAILED'): RuntimeResponse<never> => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code)
    return {
      error: {
        code,
        details: error,
        message: code.replaceAll('_', ' ').toLocaleLowerCase('en-US'),
      },
      ok: false,
    }
  }
  return {
    error: {
      code: fallbackCode,
      message: error instanceof Error ? error.message : String(error),
    },
    ok: false,
  }
}

export class RuntimeController {
  readonly #clock = { now: () => new Date() }
  readonly #ids = { next: () => crypto.randomUUID() }
  readonly #profiles = new ProfileApplicationService(this.#ids, this.#clock)
  readonly #rules = new RuleApplicationService(this.#ids, this.#clock)
  readonly #groups = new GroupApplicationService(this.#ids)
  readonly #general = new GeneralSettingsService()
  readonly #nativeImport = new NativeImportService(this.#ids)
  readonly #foxyImporter = new FoxyProxyImporter(this.#ids, this.#clock)
  readonly #proxyCheck: ProxyCheckService
  readonly #overrides: OverrideApplicationService

  constructor(private readonly options: RuntimeControllerOptions) {
    this.#overrides = new OverrideApplicationService(
      options.sessionRepository,
      this.#ids,
      this.#clock,
    )
    this.#proxyCheck = new ProxyCheckService(options.proxyCheckRequest, this.#clock)
  }

  register(): () => void {
    const listener = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: RuntimeResponse<unknown>) => void,
    ): true | undefined => {
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message) ||
        typeof message.type !== 'string'
      ) {
        return undefined
      }
      void this.handle(message as RuntimeRequest).then(sendResponse)
      return true
    }
    browser.runtime.onMessage.addListener(listener)
    return () => browser.runtime.onMessage.removeListener(listener)
  }

  async handle(request: RuntimeRequest): Promise<RuntimeResponse<unknown>> {
    try {
      switch (request.type) {
        case 'GET_STATE':
          return { ok: true, value: await this.state(request.logQuery, request.tabId) }
        case 'SET_MODE':
          return this.mutate((config) => {
            const result = this.#general.setMode(config, request.mode)
            return result.ok ? { ok: true, value: { config: result.value } } : result
          })
        case 'USE_PROFILE':
          return this.mutate((config) => {
            const result = this.#general.useProfileGlobally(
              config,
              asProxyProfileId(request.profileId),
            )
            return result.ok ? { ok: true, value: { config: result.value } } : result
          })
        case 'UPDATE_GENERAL':
          return this.mutate((config) => ({
            ok: true,
            value: {
              config: this.#general.updateGeneral(config, request.settings),
            },
          }))
        case 'UPDATE_APPEARANCE':
          return this.mutate((config) => ({
            ok: true,
            value: {
              config: this.#general.updateAppearance(config, request.appearance),
            },
          }))
        case 'SAVE_PROFILE':
          return this.mutate((config) =>
            request.profileId === null
              ? this.#profiles.create(config, request.input)
              : this.#profiles.update(config, asProxyProfileId(request.profileId), request.input),
          )
        case 'DUPLICATE_PROFILE':
          return this.mutate((config) =>
            this.#profiles.duplicate(config, asProxyProfileId(request.profileId)),
          )
        case 'DELETE_PROFILE':
          return this.mutate((config) =>
            this.#profiles.delete(config, asProxyProfileId(request.profileId), request.confirmed),
          )
        case 'SAVE_RULE':
          return this.mutate((config) =>
            request.ruleId === null
              ? this.#rules.create(config, request.input)
              : this.#rules.update(config, asRuleId(request.ruleId), request.input),
          )
        case 'DUPLICATE_RULE':
          return this.mutate((config) => this.#rules.duplicate(config, asRuleId(request.ruleId)))
        case 'DELETE_RULE':
          return this.mutate((config) => this.#rules.delete(config, asRuleId(request.ruleId)))
        case 'SET_RULE_ENABLED':
          return this.mutate((config) =>
            this.#rules.setEnabled(config, asRuleId(request.ruleId), request.enabled),
          )
        case 'REORDER_RULE':
          return this.mutate((config) =>
            this.#rules.reorder(
              config,
              asRuleId(request.ruleId),
              request.toPosition,
              request.filtersActive,
            ),
          )
        case 'SAVE_GROUP':
          return this.mutate((config) =>
            request.groupId === null
              ? this.#groups.create(config, request.name)
              : this.#groups.rename(config, asRuleGroupId(request.groupId), request.name),
          )
        case 'DELETE_GROUP':
          return this.mutate((config) =>
            this.#groups.delete(
              config,
              asRuleGroupId(request.groupId),
              request.destinationGroupId === null
                ? null
                : asRuleGroupId(request.destinationGroupId),
              request.confirmed,
            ),
          )
        case 'CREATE_OVERRIDE':
          return this.createOverride(request.scope, request.action, request.tabId)
        case 'PREVIEW_SITE_ACTION':
          return this.previewSiteAction(request.scope, request.tabId)
        case 'CREATE_SITE_RULE':
          return this.createSiteRule(request.scope, request.action, request.tabId)
        case 'REMOVE_OVERRIDE': {
          const removed = await this.#overrides.remove(asTemporaryOverrideId(request.overrideId))
          if (!removed.ok) return commandError(removed.error)
          await this.options.applyConfiguration()
          return { ok: true, value: await this.state() }
        }
        case 'CLEAR_LOGS':
          await this.options.logs.clear()
          if (request.includePrivate) this.options.privateLogs.clear()
          return { ok: true, value: null }
        case 'EXPORT_NATIVE': {
          const config = await this.readConfig()
          if (!config.ok) return config
          const now = new Date()
          return {
            ok: true,
            value: {
              filename: nativeExportFilename(now),
              text: serializeNativeExport(config.value, {
                includeCredentials: request.includeCredentials,
                now,
              }),
            },
          }
        }
        case 'PREVIEW_NATIVE_IMPORT': {
          const config = await this.readConfig()
          if (!config.ok) return config
          const preview = this.#nativeImport.preview(request.text, config.value)
          if (!preview.ok) return commandError(preview.error)
          return {
            ok: true,
            value: {
              groups: preview.value.groups,
              idConflicts: preview.value.idConflicts,
              includesCredentials: preview.value.includesCredentials,
              nameConflicts: preview.value.nameConflicts,
              profiles: preview.value.profiles,
              rules: preview.value.rules,
              warnings: preview.value.warnings,
            },
          }
        }
        case 'APPLY_NATIVE_IMPORT':
          return this.applyNativeImport(request)
        case 'PREVIEW_FOXYPROXY_IMPORT': {
          const parsed = parseFoxyProxyExport(request.text)
          if (!parsed.ok) return commandError(parsed.error)
          return {
            ok: true,
            value: {
              adapter: parsed.value.adapter,
              candidates: parsed.value.candidates.map((candidate) => ({
                active: candidate.active,
                hasCredentials: candidate.username.length > 0 || candidate.password.length > 0,
                hostname: candidate.hostname,
                port: candidate.port,
                sourceIndex: candidate.sourceIndex,
                title: candidate.title,
                transport: candidate.transport,
              })),
              excludedData: parsed.value.excludedData,
              skipped: parsed.value.skipped,
            },
          }
        }
        case 'APPLY_FOXYPROXY_IMPORT':
          return this.applyFoxyProxyImport(request)
        case 'CHECK_PROFILE':
          return this.checkProfile(request.profileId)
        case 'CANCEL_PROXY_CHECK':
          this.#proxyCheck.cancel()
          return { ok: true, value: null }
        case 'GET_ERROR_CONTEXT': {
          const context = this.options.errorStore.get(request.token)
          return context.ok ? { ok: true, value: context.value } : commandError(context.error)
        }
        case 'RETRY_ERROR':
          return this.retryError(request.token, false)
        case 'DIRECT_ONCE_FROM_ERROR':
          return this.retryError(request.token, true)
        case 'RETRY_APPLY':
          await this.options.applyConfiguration()
          return { ok: true, value: await this.state() }
        case 'OPEN_SETTINGS':
          if (request.section === undefined) {
            await browser.runtime.openOptionsPage()
          } else {
            await browser.tabs.create({
              url: browser.runtime.getURL(`/options.html#${encodeURIComponent(request.section)}`),
            })
          }
          return { ok: true, value: null }
      }
    } catch (error) {
      return commandError(error)
    }
  }

  private async mutate(transform: ConfigTransform): Promise<RuntimeResponse<unknown>> {
    const current = await this.options.configRepository.initialize()
    if (!current.ok) return commandError(current.error)
    const transformed = transform(current.value)
    if (!transformed.ok) return commandError(transformed.error)
    const refreshed = this.#rules.refreshValidity(transformed.value.config)
    const saved = await this.options.configRepository.replace(current.value.revision, refreshed)
    if (!saved.ok) return commandError(saved.error)
    await this.options.applyConfiguration()
    return { ok: true, value: await this.state() }
  }

  private async readConfig(): Promise<RuntimeResponse<AppConfig>> {
    const config = await this.options.configRepository.initialize()
    return config.ok ? { ok: true, value: config.value } : commandError(config.error)
  }

  private async createOverride(
    scope: 'EXACT_HOSTNAME' | 'REGISTRABLE_DOMAIN',
    action: Extract<RuntimeRequest, { type: 'CREATE_OVERRIDE' }>['action'],
    tabId?: number,
  ): Promise<RuntimeResponse<unknown>> {
    const config = await this.options.configRepository.initialize()
    if (!config.ok) return commandError(config.error)
    const tab = await this.targetTab(tabId)
    if (tab?.id === undefined || tab.url === undefined) {
      return commandError({ code: 'NO_ACTIVE_TAB' })
    }
    const created = await this.#overrides.create(config.value, {
      action,
      incognito: tab.incognito,
      platform: this.options.adapter.capabilities.platform,
      scope,
      tabId: tab.id,
      url: tab.url,
    })
    if (!created.ok) return commandError(created.error)
    await this.options.applyConfiguration()
    return { ok: true, value: await this.state() }
  }

  private async previewSiteAction(
    scope: 'EXACT_HOSTNAME' | 'REGISTRABLE_DOMAIN',
    tabId?: number,
  ): Promise<RuntimeResponse<unknown>> {
    const tab = await this.targetTab(tabId)
    if (tab?.url === undefined) {
      return commandError({ code: 'NO_ACTIVE_TAB' })
    }
    const preview = this.#overrides.preview(
      tab.url,
      scope,
      this.options.adapter.capabilities.platform,
    )
    return preview.ok ? { ok: true, value: preview.value } : commandError(preview.error)
  }

  private async applyNativeImport(
    request: Extract<RuntimeRequest, { type: 'APPLY_NATIVE_IMPORT' }>,
  ): Promise<RuntimeResponse<unknown>> {
    const current = await this.options.configRepository.initialize()
    if (!current.ok) return commandError(current.error)
    const preview = this.#nativeImport.preview(request.text, current.value)
    if (!preview.ok) return commandError(preview.error)
    const imported = this.#nativeImport.apply(
      current.value,
      preview.value,
      request.mode,
      request.replaceConfirmed,
    )
    if (!imported.ok) return commandError(imported.error)
    const saved = await this.options.configRepository.replace(
      current.value.revision,
      imported.value,
    )
    if (!saved.ok) return commandError(saved.error)
    await this.options.applyConfiguration()
    return { ok: true, value: await this.state() }
  }

  private async createSiteRule(
    scope: 'EXACT_HOSTNAME' | 'REGISTRABLE_DOMAIN',
    action: Extract<RuntimeRequest, { type: 'CREATE_SITE_RULE' }>['action'],
    tabId?: number,
  ): Promise<RuntimeResponse<unknown>> {
    const current = await this.options.configRepository.initialize()
    if (!current.ok) return commandError(current.error)
    const tab = await this.targetTab(tabId)
    if (tab?.url === undefined) {
      return commandError({ code: 'NO_ACTIVE_TAB' })
    }
    const preview = this.#overrides.preview(
      tab.url,
      scope,
      this.options.adapter.capabilities.platform,
    )
    if (!preview.ok) return commandError(preview.error)
    const group = current.value.groups[0]
    if (group === undefined) {
      return commandError({ code: 'GROUP_NOT_FOUND' })
    }
    let hostname = 'site'
    try {
      hostname = new URL(tab.url).hostname
    } catch {
      return commandError({ code: 'INVALID_URL' })
    }
    return this.mutate((config) =>
      this.#rules.create(config, {
        action,
        description: `Created from the popup for ${preview.value.originKey}.`,
        enabled: true,
        flags: 'i',
        groupId: group.id,
        matcherType: 'ORIGIN',
        name: `${hostname} ${action.type === 'DIRECT' ? 'direct' : 'proxy'}`,
        pattern: preview.value.generatedPattern,
      }),
    )
  }

  private async applyFoxyProxyImport(
    request: Extract<RuntimeRequest, { type: 'APPLY_FOXYPROXY_IMPORT' }>,
  ): Promise<RuntimeResponse<unknown>> {
    const parsed = parseFoxyProxyExport(request.text)
    if (!parsed.ok) return commandError(parsed.error)
    const current = await this.options.configRepository.initialize()
    if (!current.ok) return commandError(current.error)
    const imported = this.#foxyImporter.import(
      current.value,
      parsed.value.candidates,
      new Set(request.selectedSourceIndexes),
    )
    if (!imported.ok) return commandError(imported.error)
    const saved = await this.options.configRepository.replace(
      current.value.revision,
      imported.value.config,
    )
    if (!saved.ok) return commandError(saved.error)
    await this.options.applyConfiguration()
    return { ok: true, value: await this.state() }
  }

  private async retryError(token: string, directOnce: boolean): Promise<RuntimeResponse<unknown>> {
    const context = this.options.errorStore.get(token)
    if (!context.ok) return commandError(context.error)
    const retryUrl = this.options.errorStore.consumeRetryUrl(token)
    if (!retryUrl.ok) return commandError(retryUrl.error)
    if (directOnce) {
      const config = await this.options.configRepository.initialize()
      if (!config.ok) return commandError(config.error)
      const created = await this.#overrides.create(config.value, {
        action: { targetProxyProfileId: null, type: 'DIRECT' },
        incognito: context.value.incognito,
        platform: this.options.adapter.capabilities.platform,
        scope: 'EXACT_HOSTNAME',
        tabId: context.value.tabId,
        url: retryUrl.value,
      })
      if (!created.ok) return commandError(created.error)
      await this.options.applyConfiguration()
    }
    await browser.tabs.update(context.value.tabId, { url: retryUrl.value })
    return { ok: true, value: null }
  }

  private async checkProfile(profileId: string): Promise<RuntimeResponse<unknown>> {
    const current = await this.options.configRepository.initialize()
    if (!current.ok) return commandError(current.error)
    const profile = current.value.profiles.find((candidate) => candidate.id === profileId)
    if (profile === undefined) {
      return commandError({ code: 'PROFILE_NOT_FOUND' })
    }
    const result = await this.#proxyCheck.check(profile, current.value.general)
    if (!result.ok) return commandError(result.error)
    const saved = await this.options.configRepository.update(current.value.revision, (config) => ({
      ...config,
      profiles: config.profiles.map((candidate) =>
        candidate.id === profile.id
          ? {
              ...candidate,
              lastCheck: result.value,
              updatedAt: asIsoTimestamp(new Date().toISOString()),
            }
          : candidate,
      ),
    }))
    if (!saved.ok) return commandError(saved.error)
    await this.options.applyConfiguration()
    return { ok: true, value: await this.state() }
  }

  private async state(
    logQuery: LogQuery = {
      errorsOnly: false,
      hostname: '',
      limit: 100,
      offset: 0,
      platform: null,
    },
    tabId?: number,
  ): Promise<AppRuntimeState> {
    const configResult = await this.options.configRepository.initialize()
    if (!configResult.ok) {
      throw new Error(configResult.error.code)
    }
    const config = configResult.value
    const [overrides, controlStatus, tab, logs, incognitoStatus] = await Promise.all([
      this.options.sessionRepository.getOverrides(),
      this.options.adapter.getControlStatus(),
      this.targetTab(tabId),
      this.options.logs.page(logQuery),
      new IncognitoCapabilityService(() => browser.extension.isAllowedIncognitoAccess()).status(
        this.options.adapter.capabilities.platform,
      ),
    ])
    const snapshot = buildRoutingSnapshot(config, overrides, new Date())
    const inspection = snapshot.ok
      ? inspectTab(
          snapshot.value,
          {
            id: tab?.id ?? null,
            incognito: tab?.incognito ?? false,
            url: tab?.url ?? null,
          },
          controlStatus,
          this.options.adapter.capabilities.platform,
          new Date(),
        )
      : null
    const apply = this.options.diagnostics()
    const diagnostics: RuntimeDiagnostics = {
      appVersion: browser.runtime.getManifest().version,
      appliedRevision: apply.appliedRevision,
      appliedSnapshotHash: apply.appliedSnapshotHash,
      browserUserAgent: navigator.userAgent,
      capabilities: this.options.adapter.capabilities,
      controlStatus,
      incognitoAllowed: incognitoStatus.allowed,
      incognitoHelp: incognitoStatus.help,
      lastApplyError: apply.lastApplyError,
      persistedRevision: config.revision,
      platform: this.options.adapter.capabilities.platform,
      schemaVersion: config.schemaVersion,
    }
    return {
      activeTabId: tab?.id ?? null,
      activeTabIncognito: tab?.incognito ?? false,
      activeTabUrl: tab?.url ?? null,
      config,
      diagnostics,
      inspection,
      logs,
      overrides,
      privateLogCount: this.options.privateLogs.size,
    }
  }

  private async targetTab(tabId?: number) {
    return resolveTargetTab<Browser.tabs.Tab>(browser.tabs, tabId)
  }
}
