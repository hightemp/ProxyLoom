import { describe, expect, it } from 'vitest'

import { inspectDownloadFailure } from '../../../src/application/downloads/download-failure'

describe('download failure details', () => {
  it('returns only hostname and a bounded browser error code', () => {
    const result = inspectDownloadFailure(
      'https://user:password@example.com/private/file?token=canary',
      'NETWORK_FAILED',
    )
    expect(result).toEqual({
      ok: true,
      value: {
        errorCode: 'NETWORK_FAILED',
        hostname: 'example.com',
      },
    })
    expect(JSON.stringify(result)).not.toContain('private/file')
    expect(JSON.stringify(result)).not.toContain('canary')
  })

  it('does not notify for explicit user cancellation and sanitizes unknown error text', () => {
    expect(inspectDownloadFailure('https://example.com/file', 'USER_CANCELED')).toEqual({
      error: { code: 'USER_CANCELLED' },
      ok: false,
    })
    expect(
      inspectDownloadFailure('https://example.com/file', 'unsafe path / secret'),
    ).toMatchObject({
      ok: true,
      value: { errorCode: 'DOWNLOAD_FAILED' },
    })
  })
})
