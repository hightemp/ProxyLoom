import { err, ok, type Result } from '../types/result'

export const MAX_PATTERN_LENGTH = 2_048

export type RegexValidationCode =
  | 'EMPTY_PATTERN'
  | 'PATTERN_TOO_LONG'
  | 'UNSUPPORTED_FLAG'
  | 'DUPLICATE_FLAG'
  | 'BACKREFERENCE_UNSUPPORTED'
  | 'UNSAFE_PATTERN'
  | 'INVALID_SYNTAX'

export interface RegexValidationError {
  readonly code: RegexValidationCode
  readonly detail: string
}

export interface ValidatedRegex {
  readonly pattern: string
  readonly flags: string
}

const ALLOWED_FLAGS = new Set(['i', 'm'])

const isRepeatedQuantifierAt = (pattern: string, index: number): boolean => {
  const next = pattern[index]
  if (next === '+' || next === '*') return true
  if (next !== '{') return false
  const close = pattern.indexOf('}', index + 1)
  return close !== -1 && /^\d+,\d*$/u.test(pattern.slice(index + 1, close))
}

const isEscapedAt = (pattern: string, index: number): boolean => {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && pattern[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

const endsWithRepeatedQuantifier = (pattern: string, end: number): boolean => {
  const last = pattern[end - 1]
  if ((last === '+' || last === '*') && !isEscapedAt(pattern, end - 1)) return true
  if (last !== '}' || isEscapedAt(pattern, end - 1)) return false
  const open = pattern.lastIndexOf('{', end - 1)
  return (
    open !== -1 &&
    !isEscapedAt(pattern, open) &&
    /^\d+,\d*$/u.test(pattern.slice(open + 1, end - 1))
  )
}

const topLevelAlternatives = (body: string): readonly string[] => {
  const alternatives: string[] = []
  let classOpen = false
  let depth = 0
  let start = 0
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '[') classOpen = true
    else if (character === ']') classOpen = false
    else if (!classOpen && character === '(') depth += 1
    else if (!classOpen && character === ')') depth -= 1
    else if (!classOpen && depth === 0 && character === '|') {
      alternatives.push(body.slice(start, index))
      start = index + 1
    }
  }
  alternatives.push(body.slice(start))
  return alternatives
}

const hasUnsafeRepeatedGroup = (pattern: string): boolean => {
  const groupStarts: number[] = []
  let classOpen = false
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '[') {
      classOpen = true
      continue
    }
    if (character === ']') {
      classOpen = false
      continue
    }
    if (classOpen) continue
    if (character === '(') {
      groupStarts.push(index)
      continue
    }
    if (character !== ')') continue
    const start = groupStarts.pop()
    if (start === undefined || !isRepeatedQuantifierAt(pattern, index + 1)) continue
    if (endsWithRepeatedQuantifier(pattern, index)) return true
    const bodyStart = pattern.startsWith('?:', start + 1) ? start + 3 : start + 1
    const alternatives = topLevelAlternatives(pattern.slice(bodyStart, index)).filter(
      (alternative) => alternative.length > 0,
    )
    for (const [leftIndex, left] of alternatives.entries()) {
      for (const [rightIndex, right] of alternatives.entries()) {
        if (leftIndex !== rightIndex && (left.startsWith(right) || right.startsWith(left))) {
          return true
        }
      }
    }
  }
  return false
}

export const canonicalizeFlags = (flags: string): Result<string, RegexValidationError> => {
  const seen = new Set<string>()
  for (const flag of flags) {
    if (!ALLOWED_FLAGS.has(flag)) {
      return err({ code: 'UNSUPPORTED_FLAG', detail: flag })
    }
    if (seen.has(flag)) {
      return err({ code: 'DUPLICATE_FLAG', detail: flag })
    }
    seen.add(flag)
  }
  return ok(['i', 'm'].filter((flag) => seen.has(flag)).join(''))
}

export const validateRegex = (
  pattern: string,
  flags = 'i',
): Result<ValidatedRegex, RegexValidationError> => {
  if (pattern.length === 0) {
    return err({ code: 'EMPTY_PATTERN', detail: '' })
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return err({
      code: 'PATTERN_TOO_LONG',
      detail: String(pattern.length),
    })
  }

  const validatedFlags = canonicalizeFlags(flags)
  if (!validatedFlags.ok) {
    return validatedFlags
  }
  if (/\\[1-9]/.test(pattern)) {
    return err({ code: 'BACKREFERENCE_UNSUPPORTED', detail: '' })
  }
  try {
    new RegExp(pattern, validatedFlags.value)
  } catch (error) {
    return err({
      code: 'INVALID_SYNTAX',
      detail: error instanceof Error ? error.message : 'Invalid regular expression',
    })
  }
  if (hasUnsafeRepeatedGroup(pattern)) {
    return err({ code: 'UNSAFE_PATTERN', detail: '' })
  }

  return ok({ flags: validatedFlags.value, pattern })
}

export const matchesRegex = (
  target: string,
  pattern: string,
  flags: string,
): Result<boolean, RegexValidationError> => {
  const validation = validateRegex(pattern, flags)
  if (!validation.ok) {
    return validation
  }
  return ok(new RegExp(validation.value.pattern, validation.value.flags).test(target))
}
