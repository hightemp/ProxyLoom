import type { EditableProfile } from '../profiles/profile-service'
import type { EditableRule } from '../rules/rule-service'
import type { LogEntry, LogQuery } from '../logging/log-types'
import type { PlatformCapabilities } from '../ports/proxy-platform'
import type { TabInspection } from '../inspection/current-tab-inspection'
import type {
  AppConfig,
  AppearanceSettings,
  BrowserPlatform,
  ControlStatus,
  GeneralSettings,
  GlobalMode,
  OverrideScope,
  RuleAction,
  TemporaryOverride,
} from '../../domain/types/entities'
import type { ErrorContext } from '../errors/error-correlation-store'
import type { IncognitoHelp } from '../incognito/incognito-capability-service'

export interface RuntimeDiagnostics {
  readonly appVersion: string
  readonly browserUserAgent: string
  readonly schemaVersion: number
  readonly persistedRevision: number
  readonly appliedRevision: number | null
  readonly appliedSnapshotHash: string | null
  readonly lastApplyError: string | null
  readonly controlStatus: ControlStatus
  readonly platform: BrowserPlatform
  readonly capabilities: PlatformCapabilities
  readonly incognitoAllowed: boolean | null
  readonly incognitoHelp: IncognitoHelp
}

export interface AppRuntimeState {
  readonly config: AppConfig
  readonly overrides: readonly TemporaryOverride[]
  readonly inspection: TabInspection | null
  readonly activeTabId: number | null
  readonly activeTabUrl: string | null
  readonly activeTabIncognito: boolean
  readonly logs: readonly LogEntry[]
  readonly privateLogCount: number
  readonly diagnostics: RuntimeDiagnostics
}

export interface NativeImportPreviewView {
  readonly profiles: number
  readonly rules: number
  readonly includesCredentials: boolean
  readonly idConflicts: number
  readonly nameConflicts: number
  readonly warnings: readonly string[]
}

export interface FoxyProxyCandidateView {
  readonly sourceIndex: number
  readonly title: string
  readonly hostname: string
  readonly port: number
  readonly transport: 'HTTP' | 'HTTPS'
  readonly active: boolean
  readonly hasCredentials: boolean
}

export interface FoxyProxyPreviewView {
  readonly adapter: string
  readonly candidates: readonly FoxyProxyCandidateView[]
  readonly skipped: readonly {
    readonly sourceIndex: number
    readonly title: string
    readonly reason: string
  }[]
  readonly excludedData: readonly string[]
}

export type RuntimeRequest =
  | { readonly type: 'GET_STATE'; readonly logQuery?: LogQuery; readonly tabId?: number }
  | { readonly type: 'SET_MODE'; readonly mode: GlobalMode }
  | { readonly type: 'USE_PROFILE'; readonly profileId: string }
  | {
      readonly type: 'UPDATE_GENERAL'
      readonly settings: GeneralSettings
    }
  | {
      readonly type: 'UPDATE_APPEARANCE'
      readonly appearance: AppearanceSettings
    }
  | {
      readonly type: 'SAVE_PROFILE'
      readonly profileId: string | null
      readonly input: EditableProfile
    }
  | { readonly type: 'DUPLICATE_PROFILE'; readonly profileId: string }
  | {
      readonly type: 'DELETE_PROFILE'
      readonly profileId: string
      readonly confirmed: boolean
    }
  | {
      readonly type: 'SAVE_RULE'
      readonly ruleId: string | null
      readonly input: EditableRule
    }
  | { readonly type: 'DUPLICATE_RULE'; readonly ruleId: string }
  | { readonly type: 'DELETE_RULE'; readonly ruleId: string }
  | {
      readonly type: 'SET_RULE_ENABLED'
      readonly ruleId: string
      readonly enabled: boolean
    }
  | {
      readonly type: 'REORDER_RULE'
      readonly ruleId: string
      readonly toPosition: number
      readonly filtersActive: boolean
    }
  | {
      readonly type: 'CREATE_OVERRIDE'
      readonly scope: OverrideScope
      readonly action: RuleAction
      readonly tabId?: number
    }
  | {
      readonly type: 'PREVIEW_SITE_ACTION'
      readonly scope: OverrideScope
      readonly tabId?: number
    }
  | {
      readonly type: 'CREATE_SITE_RULE'
      readonly scope: OverrideScope
      readonly action: RuleAction
      readonly tabId?: number
    }
  | { readonly type: 'REMOVE_OVERRIDE'; readonly overrideId: string }
  | { readonly type: 'CLEAR_LOGS'; readonly includePrivate: boolean }
  | {
      readonly type: 'EXPORT_NATIVE'
      readonly includeCredentials: boolean
    }
  | { readonly type: 'PREVIEW_NATIVE_IMPORT'; readonly text: string }
  | {
      readonly type: 'APPLY_NATIVE_IMPORT'
      readonly text: string
      readonly mode: 'MERGE' | 'REPLACE'
      readonly replaceConfirmed: boolean
    }
  | { readonly type: 'PREVIEW_FOXYPROXY_IMPORT'; readonly text: string }
  | {
      readonly type: 'APPLY_FOXYPROXY_IMPORT'
      readonly text: string
      readonly selectedSourceIndexes: readonly number[]
    }
  | { readonly type: 'CHECK_PROFILE'; readonly profileId: string }
  | { readonly type: 'CANCEL_PROXY_CHECK' }
  | { readonly type: 'GET_ERROR_CONTEXT'; readonly token: string }
  | { readonly type: 'RETRY_ERROR'; readonly token: string }
  | { readonly type: 'DIRECT_ONCE_FROM_ERROR'; readonly token: string }
  | { readonly type: 'RETRY_APPLY' }
  | { readonly type: 'OPEN_SETTINGS'; readonly section?: string }

export interface RuntimeCommandError {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export type RuntimeResponse<T = unknown> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuntimeCommandError }

export type ErrorContextResponse = RuntimeResponse<ErrorContext>
