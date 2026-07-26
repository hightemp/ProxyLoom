import { err, ok, type Result } from '../../domain/types/result'

export type IpGeoProviderErrorCode =
  | 'INVALID_ENDPOINT'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'RESPONSE_TOO_LARGE'
  | 'MALFORMED_RESPONSE'
  | 'INVALID_IP'
  | 'INVALID_COUNTRY'

export interface IpGeoProviderError {
  readonly code: IpGeoProviderErrorCode
  readonly httpStatus: number | null
}

export interface IpGeoResult {
  readonly externalIp: string
  readonly country: string | null
  readonly httpStatus: number
}

export type FetchLike = (
  input: string,
  init: { readonly signal: AbortSignal; readonly cache: 'no-store' },
) => Promise<Response>

const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1_024

const isValidIp = (value: string): boolean => {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split('.').every((part) => Number.isInteger(Number(part)) && Number(part) <= 255)
  }
  return (
    value.includes(':') &&
    /^[0-9a-f:.]+$/i.test(value) &&
    value.length <= 45 &&
    !value.includes(':::')
  )
}

const readBoundedText = async (response: Response): Promise<string | null> => {
  if (response.body === null) {
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength <= MAX_PROVIDER_RESPONSE_BYTES ? text : null
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }
    total += result.value.byteLength
    if (total > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(result.value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

export const parseIpGeoPayload = (
  text: string,
  httpStatus: number,
  geoIpEnabled: boolean,
): Result<IpGeoResult, IpGeoProviderError> => {
  if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
    return err({ code: 'RESPONSE_TOO_LARGE', httpStatus })
  }
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return err({ code: 'MALFORMED_RESPONSE', httpStatus })
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return err({ code: 'MALFORMED_RESPONSE', httpStatus })
  }
  const record = payload as Readonly<Record<string, unknown>>
  if (typeof record.ip !== 'string' || !isValidIp(record.ip)) {
    return err({ code: 'INVALID_IP', httpStatus })
  }
  const country = geoIpEnabled ? record.country : null
  if (
    country !== null &&
    (typeof country !== 'string' || country.trim().length === 0 || country.length > 128)
  ) {
    return err({ code: 'INVALID_COUNTRY', httpStatus })
  }
  return ok({
    country: typeof country === 'string' ? country : null,
    externalIp: record.ip,
    httpStatus,
  })
}

export class IpGeoProvider {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async lookup(
    endpoint: string,
    timeoutMs: number,
    geoIpEnabled: boolean,
    parentSignal?: AbortSignal,
  ): Promise<Result<IpGeoResult, IpGeoProviderError>> {
    let parsed: URL
    try {
      parsed = new URL(endpoint)
    } catch {
      return err({ code: 'INVALID_ENDPOINT', httpStatus: null })
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return err({ code: 'INVALID_ENDPOINT', httpStatus: null })
    }
    const timeoutController = new AbortController()
    const abort = (): void => timeoutController.abort()
    parentSignal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, timeoutMs)
    try {
      const response = await this.fetcher(parsed.href, {
        cache: 'no-store',
        signal: timeoutController.signal,
      })
      if (!response.ok) {
        return err({ code: 'HTTP_ERROR', httpStatus: response.status })
      }
      const text = await readBoundedText(response)
      if (text === null) {
        return err({
          code: 'RESPONSE_TOO_LARGE',
          httpStatus: response.status,
        })
      }
      return parseIpGeoPayload(text, response.status, geoIpEnabled)
    } catch {
      return err({
        code: timeoutController.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
        httpStatus: null,
      })
    } finally {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abort)
    }
  }
}
