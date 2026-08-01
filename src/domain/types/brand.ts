declare const brand: unique symbol

export type Brand<T, Name extends string> = T & {
  readonly [brand]: Name
}

export type ProxyProfileId = Brand<string, 'ProxyProfileId'>
export type RuleId = Brand<string, 'RuleId'>
export type TemporaryOverrideId = Brand<string, 'TemporaryOverrideId'>
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i

const assertId = (value: string): string => {
  if (!ID_PATTERN.test(value)) {
    throw new TypeError('ID must be 1–128 characters from the portable ID alphabet.')
  }
  return value
}

export const asProxyProfileId = (value: string): ProxyProfileId => assertId(value) as ProxyProfileId

export const asRuleId = (value: string): RuleId => assertId(value) as RuleId

export const asTemporaryOverrideId = (value: string): TemporaryOverrideId =>
  assertId(value) as TemporaryOverrideId

export const asIsoTimestamp = (value: string): IsoTimestamp => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError('Timestamp must be a canonical ISO-8601 UTC string.')
  }
  return value as IsoTimestamp
}

export interface IdGenerator {
  next(): string
}
