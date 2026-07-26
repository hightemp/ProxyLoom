import { describe, expect, it } from 'vitest'

import { ConfigApplicationService } from '../../../src/application/config/config-application-service'
import type {
  PlatformApplyError,
  ProxyPlatformAdapter,
} from '../../../src/application/ports/proxy-platform'
import { ok, type Result } from '../../../src/domain/types/result'
import type { RoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { config, profile } from '../domain/fixtures'

class FakeAdapter implements ProxyPlatformAdapter {
  readonly capabilities = {
    actualProxyInfo: false,
    fullUrlRules: false,
    guaranteedErrorPage: false,
    platform: 'CHROMIUM',
    tabSpecificOverrides: false,
  } as const

  directCalls: number[] = []
  snapshots: RoutingSnapshot[] = []

  getControlStatus() {
    return Promise.resolve('CONTROLLABLE' as const)
  }

  applyDirect(revision: number): Promise<Result<number, PlatformApplyError>> {
    this.directCalls.push(revision)
    return Promise.resolve(ok(revision))
  }

  applySnapshot(snapshot: RoutingSnapshot): Promise<Result<number, PlatformApplyError>> {
    this.snapshots.push(snapshot)
    return Promise.resolve(ok(snapshot.revision))
  }
}

describe('configuration application service', () => {
  it('uses true direct mode without compiling PAC', async () => {
    const adapter = new FakeAdapter()
    const service = new ConfigApplicationService(adapter)
    const result = await service.apply(
      config({
        general: {
          ...config().general,
          mode: 'DIRECT',
        },
      }),
      [],
      new Date(),
    )
    expect(result.ok).toBe(true)
    expect(adapter.directCalls).toEqual([1])
  })

  it('applies routed snapshots through the abstract platform port', async () => {
    const adapter = new FakeAdapter()
    const service = new ConfigApplicationService(adapter)
    const global = profile('global')
    const value = config({
      general: {
        ...config().general,
        activeProxyProfileId: global.id,
        mode: 'PROXY',
      },
      profiles: [global],
    })
    const result = await service.apply(value, [], new Date())
    expect(result.ok).toBe(true)
    expect(adapter.snapshots).toHaveLength(1)
  })
})
