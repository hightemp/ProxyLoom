export const serializePacData = (value: unknown): string => {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('PAC data must be JSON serializable.')
  }
  return serialized
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
