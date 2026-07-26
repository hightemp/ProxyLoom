import { err, ok, type Result } from '../../../domain/types/result'

export const MAX_PAC_BYTES = 1_000_000
export const PAC_WARNING_BYTES = 750_000

export interface PacSizeMetrics {
  readonly byteLength: number
  readonly warning: 'PAC_APPROACHING_LIMIT' | null
}

export interface PacSizeError {
  readonly code: 'PAC_TOO_LARGE'
  readonly byteLength: number
  readonly maximumByteLength: number
}

export const validatePacSize = (script: string): Result<PacSizeMetrics, PacSizeError> => {
  const byteLength = new TextEncoder().encode(script).byteLength
  if (byteLength > MAX_PAC_BYTES) {
    return err({
      byteLength,
      code: 'PAC_TOO_LARGE',
      maximumByteLength: MAX_PAC_BYTES,
    })
  }
  return ok({
    byteLength,
    warning: byteLength >= PAC_WARNING_BYTES ? 'PAC_APPROACHING_LIMIT' : null,
  })
}
