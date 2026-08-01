type UnknownRecord = Record<string, unknown>

interface PresetDemoSignature {
  readonly description: string
  readonly groupId: string
  readonly name: string
  readonly pattern: string
}

const presetDemoSignatures = new Map<string, PresetDemoSignature>([
  [
    'demo-work',
    {
      description: 'Disabled example for the Work group. You can edit or delete it.',
      groupId: 'work',
      name: 'Work example',
      pattern: '^https://work\\.example/$',
    },
  ],
  [
    'demo-russian-sites',
    {
      description: 'Disabled example for the Russian Sites group. You can edit or delete it.',
      groupId: 'russian-sites',
      name: 'Russian Sites example',
      pattern: '^https://russian\\.example/$',
    },
  ],
  [
    'demo-international-sites',
    {
      description: 'Disabled example for the International Sites group. You can edit or delete it.',
      groupId: 'international-sites',
      name: 'International Sites example',
      pattern: '^https://international\\.example/$',
    },
  ],
  [
    'demo-social-networks',
    {
      description: 'Disabled example for the Social Networks group. You can edit or delete it.',
      groupId: 'social-networks',
      name: 'Social Networks example',
      pattern: '^https://social\\.example/$',
    },
  ],
  [
    'demo-local-network',
    {
      description: 'Disabled example for the Local Network group. You can edit or delete it.',
      groupId: 'local-network',
      name: 'Local Network example',
      pattern: '^https://local\\.example/$',
    },
  ],
])

const asRecord = (value: unknown): Readonly<UnknownRecord> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<UnknownRecord>)
    : null

const isUntouchedPresetDemo = (value: unknown): boolean => {
  const rule = asRecord(value)
  if (rule === null || typeof rule.id !== 'string') return false
  const signature = presetDemoSignatures.get(rule.id)
  if (signature === undefined) return false
  const action = asRecord(rule.action)
  return (
    action?.type === 'DIRECT' &&
    action.targetProxyProfileId === null &&
    rule.description === signature.description &&
    rule.enabled === false &&
    rule.flags === 'i' &&
    rule.groupId === signature.groupId &&
    rule.matcherType === 'ORIGIN' &&
    rule.name === signature.name &&
    rule.pattern === signature.pattern &&
    rule.temporaryDisable === null &&
    rule.validity === 'VALID'
  )
}

const withoutRuleGroup = (value: unknown): unknown => {
  const source = asRecord(value)
  if (source === null) return value
  const rule = { ...source }
  delete rule.groupId
  return rule
}

const positionOf = (value: unknown): number => {
  const position = asRecord(value)?.position
  return typeof position === 'number' && Number.isFinite(position) ? position : Number.MAX_VALUE
}

const migrateRules = (rules: readonly unknown[]): readonly unknown[] =>
  rules
    .filter((rule) => !isUntouchedPresetDemo(rule))
    .toSorted((left, right) => positionOf(left) - positionOf(right))
    .map((value, position) => {
      const rule = asRecord(withoutRuleGroup(value))
      return rule === null ? value : { ...rule, position }
    })

export const removeGroupsFromVersionOne = (input: Readonly<UnknownRecord>): unknown => {
  const migrated: UnknownRecord = { ...input }
  delete migrated.groups
  migrated.rules = Array.isArray(input.rules) ? migrateRules(input.rules) : input.rules
  migrated.schemaVersion = 2
  return migrated
}
