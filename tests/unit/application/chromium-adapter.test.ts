import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChromiumProxyAdapter } from '../../../src/platform/chromium/adapter'

const mocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    proxy: {
      settings: {
        get: mocks.settingsGet,
      },
    },
  },
}))

describe('ChromiumProxyAdapter control context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settingsGet.mockResolvedValue({
      levelOfControl: 'controlled_by_this_extension',
    })
  })

  it('queries the browser-owned incognito settings context when requested', async () => {
    const adapter = new ChromiumProxyAdapter()

    await expect(adapter.getControlStatus(true)).resolves.toBe('CONTROLLED_BY_THIS_EXTENSION')
    expect(mocks.settingsGet).toHaveBeenCalledWith({ incognito: true })
  })

  it('uses the regular settings context by default', async () => {
    const adapter = new ChromiumProxyAdapter()

    await expect(adapter.getControlStatus()).resolves.toBe('CONTROLLED_BY_THIS_EXTENSION')
    expect(mocks.settingsGet).toHaveBeenCalledWith({ incognito: false })
  })
})
