import { normalizeUrl } from '../../domain/url/normalize'
import { err, ok, type Result } from '../../domain/types/result'

export interface DownloadFailureDetails {
  readonly errorCode: string
  readonly hostname: string
}

export type DownloadFailureError =
  { readonly code: 'USER_CANCELLED' } | { readonly code: 'UNSUPPORTED_DOWNLOAD_URL' }

export const inspectDownloadFailure = (
  url: string,
  errorCode: string,
): Result<DownloadFailureDetails, DownloadFailureError> => {
  if (errorCode.startsWith('USER_')) {
    return err({ code: 'USER_CANCELLED' })
  }
  const normalized = normalizeUrl(url)
  if (!normalized.ok) {
    return err({ code: 'UNSUPPORTED_DOWNLOAD_URL' })
  }
  return ok({
    errorCode: /^[A-Z0-9_]{1,128}$/.test(errorCode) ? errorCode : 'DOWNLOAD_FAILED',
    hostname: normalized.value.hostname,
  })
}
