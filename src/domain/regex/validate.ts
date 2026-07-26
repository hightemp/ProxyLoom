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
const IMMEDIATE_NESTED_QUANTIFIER =
  /\((?:\?:)?(?:\\.|[^()])*?(?:[+*]|\{\d+,\d*\})\)(?:[+*]|\{\d+,\d*\})/
const REPEATED_AMBIGUOUS_ALTERNATION =
  /\((?:\?:)?([^|()]{1,64})\|(?:\1[^|()]*)\)(?:[+*]|\{\d+,\d*\})/

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
  if (IMMEDIATE_NESTED_QUANTIFIER.test(pattern) || REPEATED_AMBIGUOUS_ALTERNATION.test(pattern)) {
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
