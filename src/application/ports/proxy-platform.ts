import type { ControlStatus } from '../../domain/types/entities'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { Result } from '../../domain/types/result'

export interface PlatformCapabilities {
  readonly platform: 'CHROMIUM' | 'FIREFOX'
  readonly fullUrlRules: boolean
  /** Whether a SOCKS5 endpoint can authenticate with username/password (ADR-016). */
  readonly socks5Auth: boolean
  readonly tabSpecificOverrides: boolean
  readonly actualProxyInfo: boolean
  readonly guaranteedErrorPage: false
}

export interface PlatformApplyError {
  readonly code: 'NOT_CONTROLLABLE' | 'API_ERROR' | 'PAC_COMPILE_ERROR' | 'SNAPSHOT_ERROR'
  readonly message: string
}

export interface ProxyPlatformAdapter {
  readonly capabilities: PlatformCapabilities
  getControlStatus(incognito?: boolean): Promise<ControlStatus>
  applyDirect(revision: number): Promise<Result<number, PlatformApplyError>>
  applySnapshot(snapshot: RoutingSnapshot): Promise<Result<number, PlatformApplyError>>
}
