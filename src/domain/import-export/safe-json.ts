import { err, ok, type Result } from '../types/result'

export const MAX_IMPORT_BYTES = 2 * 1_024 * 1_024
export const MAX_IMPORT_DEPTH = 32

export type SafeJsonErrorCode = 'FILE_TOO_LARGE' | 'JSON_INVALID' | 'TOO_DEEP' | 'DANGEROUS_KEY'

export interface SafeJsonError {
  readonly code: SafeJsonErrorCode
  readonly issues: readonly string[]
}

const inspectTree = (value: unknown, depth = 0): Result<null, SafeJsonError> => {
  if (depth > MAX_IMPORT_DEPTH) {
    return err({
      code: 'TOO_DEEP',
      issues: [`Maximum depth is ${MAX_IMPORT_DEPTH}.`],
    })
  }
  if (typeof value !== 'object' || value === null) {
    return ok(null)
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const checked = inspectTree(item, depth + 1)
      if (!checked.ok) {
        return checked
      }
    }
    return ok(null)
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      return err({
        code: 'DANGEROUS_KEY',
        issues: [`Disallowed key: ${key}.`],
      })
    }
    const checked = inspectTree(child, depth + 1)
    if (!checked.ok) {
      return checked
    }
  }
  return ok(null)
}

export const parseSafeJson = (text: string): Result<unknown, SafeJsonError> => {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    return err({
      code: 'FILE_TOO_LARGE',
      issues: [`Maximum import size is ${MAX_IMPORT_BYTES} bytes.`],
    })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return err({ code: 'JSON_INVALID', issues: ['The file is not valid JSON.'] })
  }
  const checked = inspectTree(raw)
  return checked.ok ? ok(raw) : checked
}
