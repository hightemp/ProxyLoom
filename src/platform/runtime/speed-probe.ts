import type { SpeedSample } from '../../application/proxy-check/speed'

/**
 * Runs inside the temporary check tab via `scripting.executeScript`, so the download travels
 * through the checked profile like the check itself. It must stay self-contained: no imports or
 * outer variables are available after serialization. Timing starts when response headers arrive,
 * so the result measures throughput rather than connection latency.
 */
export const measureDownloadInPage = async (
  url: string,
  maxBytes: number,
  maxMs: number,
): Promise<SpeedSample> => {
  const minimumBytes = 64 * 1_024
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), maxMs)
  try {
    let response: Response
    try {
      response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      })
    } catch {
      return { code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', ok: false }
    }
    if (!response.ok || response.body === null) {
      return { code: 'HTTP_ERROR', ok: false }
    }
    const started = performance.now()
    const reader = response.body.getReader()
    let bytes = 0
    try {
      while (bytes < maxBytes && performance.now() - started < maxMs) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
      }
    } catch {
      // The deadline aborts the body; bytes received so far still form a sample.
    }
    const durationMs = performance.now() - started
    await reader.cancel().catch(() => undefined)
    return bytes < minimumBytes
      ? { code: 'TOO_LITTLE_DATA', ok: false }
      : { bytes, durationMs, ok: true }
  } finally {
    clearTimeout(deadline)
  }
}
