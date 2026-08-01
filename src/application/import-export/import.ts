import type { IdGenerator } from '../../domain/types/brand'
import { asProxyProfileId, asRuleId } from '../../domain/types/brand'
import type { AppConfig, ProxyProfile, Rule } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'
import {
  parseNativeExportText,
  type NativeExportDocument,
  type NativeImportParseError,
} from '../../domain/import-export/native-schema'

export type ImportMode = 'MERGE' | 'REPLACE'

export interface NativeImportPreview {
  readonly document: NativeExportDocument
  readonly profiles: number
  readonly rules: number
  readonly includesCredentials: boolean
  readonly idConflicts: number
  readonly nameConflicts: number
  readonly warnings: readonly string[]
}

export type NativeImportError =
  NativeImportParseError | { readonly code: 'REPLACE_CONFIRMATION_REQUIRED' }

const caseFold = (value: string): string => value.trim().toLocaleLowerCase('en-US')

export class NativeImportService {
  constructor(private readonly ids: IdGenerator) {}

  preview(text: string, current: AppConfig): Result<NativeImportPreview, NativeImportParseError> {
    const document = parseNativeExportText(text)
    if (!document.ok) {
      return document
    }
    const existingIds = new Set([
      ...current.profiles.map(({ id }) => id),
      ...current.rules.map(({ id }) => id),
    ])
    const existingNames = new Set([
      ...current.profiles.map(({ name }) => caseFold(name)),
      ...current.rules.map(({ name }) => caseFold(name)),
    ])
    const importedEntities = [...document.value.config.profiles, ...document.value.config.rules]
    const idConflicts = importedEntities.filter(({ id }) => existingIds.has(id)).length
    const nameConflicts = importedEntities.filter(({ name }) =>
      existingNames.has(caseFold(name)),
    ).length
    const warnings: string[] = []
    if (document.value.includesCredentials) {
      warnings.push('This file contains proxy credentials.')
    }
    if (idConflicts > 0) {
      warnings.push(`${idConflicts} conflicting ID(s) will be remapped during merge.`)
    }
    if (nameConflicts > 0) {
      warnings.push(`${nameConflicts} name conflict(s) will receive an “imported” suffix.`)
    }
    return ok({
      document: document.value,
      idConflicts,
      includesCredentials: document.value.includesCredentials,
      nameConflicts,
      profiles: document.value.config.profiles.length,
      rules: document.value.config.rules.length,
      warnings,
    })
  }

  apply(
    current: AppConfig,
    preview: NativeImportPreview,
    mode: ImportMode,
    replaceConfirmed: boolean,
  ): Result<AppConfig, NativeImportError> {
    if (mode === 'REPLACE') {
      if (!replaceConfirmed) {
        return err({ code: 'REPLACE_CONFIRMATION_REQUIRED' })
      }
      return ok({
        ...structuredClone(preview.document.config),
        revision: current.revision,
      })
    }
    return ok(this.merge(current, preview.document.config))
  }

  private merge(current: AppConfig, imported: AppConfig): AppConfig {
    const usedIds = new Set<string>([
      ...current.profiles.map(({ id }) => id),
      ...current.rules.map(({ id }) => id),
    ])
    const uniqueId = (): string => {
      let candidate = this.ids.next()
      while (usedIds.has(candidate)) {
        candidate = this.ids.next()
      }
      usedIds.add(candidate)
      return candidate
    }
    const remap = <T extends string>(id: T): T => {
      if (!usedIds.has(id)) {
        usedIds.add(id)
        return id
      }
      return uniqueId() as T
    }
    const profileIdMap = new Map(
      imported.profiles.map(({ id }) => [id, asProxyProfileId(remap(id))]),
    )
    const ruleIdMap = new Map(imported.rules.map(({ id }) => [id, asRuleId(remap(id))]))

    const usedProfileNames = new Set(current.profiles.map(({ name }) => caseFold(name)))
    const usedRuleNames = new Set(current.rules.map(({ name }) => caseFold(name)))
    const uniqueName = (name: string, used: Set<string>): string => {
      if (!used.has(caseFold(name))) {
        used.add(caseFold(name))
        return name
      }
      let number = 1
      let candidate = `${name} imported`
      while (used.has(caseFold(candidate))) {
        number += 1
        candidate = `${name} imported ${number}`
      }
      used.add(caseFold(candidate))
      return candidate
    }

    const profiles: ProxyProfile[] = imported.profiles.map((profile) => ({
      ...profile,
      id: profileIdMap.get(profile.id)!,
      name: uniqueName(profile.name, usedProfileNames),
    }))
    const currentProfileIds = new Set(current.profiles.map(({ id }) => id))
    const rules: Rule[] = imported.rules.map((rule, index) => {
      const targetId = rule.action.targetProxyProfileId
      const remappedTarget = targetId === null ? null : (profileIdMap.get(targetId) ?? targetId)
      const validTarget =
        rule.action.type === 'DIRECT' ||
        (remappedTarget !== null &&
          (currentProfileIds.has(remappedTarget) ||
            profiles.some(({ id }) => id === remappedTarget)))
      return {
        ...rule,
        action: {
          ...rule.action,
          targetProxyProfileId: remappedTarget,
        },
        id: ruleIdMap.get(rule.id)!,
        name: uniqueName(rule.name, usedRuleNames),
        position: current.rules.length + index,
        validity: validTarget ? rule.validity : 'INVALID_REFERENCE',
      }
    })
    return {
      ...current,
      profiles: [...current.profiles, ...profiles],
      rules: [...current.rules, ...rules],
    }
  }
}
