export type SpeedErrorCode =
  'INVALID_ENDPOINT' | 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'TOO_LITTLE_DATA'

/** One bounded download through the checked profile. */
export type SpeedSample =
  | { readonly ok: true; readonly bytes: number; readonly durationMs: number }
  | { readonly ok: false; readonly code: SpeedErrorCode }

export interface SpeedTestRequest {
  readonly endpoint: string
  readonly maxBytes: number
  readonly maxMs: number
}

/** Megabits per second, rounded to one decimal; a zero duration counts as one millisecond. */
export const downloadMbps = (bytes: number, durationMs: number): number =>
  Math.round(((bytes * 8) / (Math.max(1, durationMs) * 1_000)) * 10) / 10
