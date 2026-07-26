import { describe, expect, it, vi } from 'vitest'

import { IncognitoCapabilityService } from '../../../src/application/incognito/incognito-capability-service'

describe('incognito capability service', () => {
  it.each([
    ['CHROMIUM', true, 'CHROMIUM_EXTENSION_DETAILS'],
    ['FIREFOX', false, 'FIREFOX_MANAGE_EXTENSION'],
  ] as const)(
    'reports the browser-owned %s permission honestly',
    async (platform, allowed, help) => {
      const check = vi.fn().mockResolvedValue(allowed)
      const service = new IncognitoCapabilityService(check)

      await expect(service.status(platform)).resolves.toEqual({ allowed, help })
      expect(check).toHaveBeenCalledOnce()
    },
  )

  it('reports an unavailable browser API as unknown', async () => {
    const service = new IncognitoCapabilityService(() =>
      Promise.reject(new Error('API unavailable')),
    )

    await expect(service.status('CHROMIUM')).resolves.toEqual({
      allowed: null,
      help: 'CHROMIUM_EXTENSION_DETAILS',
    })
  })
})
