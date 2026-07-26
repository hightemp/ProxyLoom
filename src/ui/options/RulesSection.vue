<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, watch } from 'vue'

import { RegexBatchTester } from '../../application/regex-tester/regex-batch-tester'
import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import {
  testRouting,
  type RoutingTestResult,
} from '../../application/routing-tester/routing-tester'
import { buildRoutingSnapshot } from '../../domain/routing/snapshot'
import { generateRuleTemplate, type RuleTemplateId } from '../../domain/rules/templates'
import type { MatcherType, Rule, RuleActionType } from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { createRegexWorker } from '../runtime/regex-worker-factory'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()

interface RuleDraft {
  name: string
  description: string
  enabled: boolean
  groupId: string
  matcherType: MatcherType
  pattern: string
  flags: string
  actionType: RuleActionType
  targetProxyProfileId: string
}

const firstGroupId = (): string => props.state.config.groups[0]?.id ?? ''
const blankRule = (): RuleDraft => ({
  actionType: 'DIRECT',
  description: '',
  enabled: true,
  flags: 'i',
  groupId: firstGroupId(),
  matcherType: 'ORIGIN',
  name: '',
  pattern: '^https://example\\.com/$',
  targetProxyProfileId: '',
})

const copyRule = (rule: Rule): RuleDraft => ({
  actionType: rule.action.type,
  description: rule.description,
  enabled: rule.enabled,
  flags: rule.flags,
  groupId: rule.groupId,
  matcherType: rule.matcherType,
  name: rule.name,
  pattern: rule.pattern,
  targetProxyProfileId: rule.action.targetProxyProfileId ?? '',
})

const editingId = shallowRef<string | null>(null)
const formOpen = shallowRef(false)
const draft = reactive<RuleDraft>(blankRule())
const editorNameInput = shallowRef<HTMLInputElement | null>(null)
const search = shallowRef('')
const groupFilter = shallowRef('')
const actionFilter = shallowRef('')
const enabledFilter = shallowRef('')
const compatibilityFilter = shallowRef('')
const dragId = shallowRef<string | null>(null)
const groupName = shallowRef('')
const editingGroupId = shallowRef<string | null>(null)
const editingGroupName = shallowRef('')
const groupDestinations = reactive<Record<string, string>>({})
const groupStatus = shallowRef('')
const templateId = shallowRef<RuleTemplateId>('EXACT_HOSTNAME')
const templateHost = shallowRef('example.com')
const testLines = shallowRef('https://example.com/path\nhttps://other.example/')
const testRows = shallowRef<
  readonly {
    input: string
    normalizedTarget: string | null
    matched: boolean | null
    errorCode: string | null
  }[]
>([])
const testerStatus = shallowRef('')
const routeUrl = shallowRef('https://example.com/path?query=1')
const routingResult = shallowRef<RoutingTestResult | null>(null)
const tester = new RegexBatchTester(createRegexWorker)
let editorActivator: HTMLElement | null = null
const restoreEditorFocus = shallowRef(false)

const filtersActive = computed(
  () =>
    search.value.trim() !== '' ||
    groupFilter.value !== '' ||
    actionFilter.value !== '' ||
    enabledFilter.value !== '' ||
    compatibilityFilter.value !== '',
)

const filteredRules = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('en-US')
  return [...props.state.config.rules]
    .sort((left, right) => left.position - right.position)
    .filter(
      (rule) =>
        (query === '' ||
          rule.name.toLocaleLowerCase('en-US').includes(query) ||
          rule.pattern.toLocaleLowerCase('en-US').includes(query)) &&
        (groupFilter.value === '' || rule.groupId === groupFilter.value) &&
        (actionFilter.value === '' || rule.action.type === actionFilter.value) &&
        (enabledFilter.value === '' || String(rule.enabled) === enabledFilter.value) &&
        (compatibilityFilter.value === '' ||
          (compatibilityFilter.value === 'FIREFOX_ONLY'
            ? rule.matcherType === 'FULL_URL'
            : rule.matcherType === 'ORIGIN')),
    )
})

const replaceDraft = (next: RuleDraft): void => {
  Object.assign(draft, next)
}

const restoreFocus = (): void => {
  if (!restoreEditorFocus.value || props.busy) return
  restoreEditorFocus.value = false
  void nextTick(() => editorActivator?.focus())
}

const closeEditor = (): void => {
  formOpen.value = false
  restoreEditorFocus.value = true
  restoreFocus()
}

const create = (event: MouseEvent): void => {
  editorActivator = event.currentTarget as HTMLElement
  editingId.value = null
  replaceDraft(blankRule())
  formOpen.value = true
  void nextTick(() => editorNameInput.value?.focus())
}

const edit = (rule: Rule, event: MouseEvent): void => {
  editorActivator = event.currentTarget as HTMLElement
  editingId.value = rule.id
  replaceDraft(copyRule(rule))
  formOpen.value = true
  void nextTick(() => editorNameInput.value?.focus())
}

const save = (): void => {
  if (
    draft.matcherType === 'FULL_URL' &&
    props.state.diagnostics.platform === 'CHROMIUM' &&
    !window.confirm(t('fullUrlSaveWarning'))
  ) {
    return
  }
  emit('command', {
    input: {
      action: {
        targetProxyProfileId:
          draft.actionType === 'PROXY'
            ? (draft.targetProxyProfileId as Rule['action']['targetProxyProfileId'])
            : null,
        type: draft.actionType,
      },
      description: draft.description,
      enabled: draft.enabled,
      flags: draft.flags,
      groupId: draft.groupId as Rule['groupId'],
      matcherType: draft.matcherType,
      name: draft.name,
      pattern: draft.pattern,
    },
    ruleId: editingId.value,
    type: 'SAVE_RULE',
  })
  closeEditor()
}

const applyTemplate = (): void => {
  try {
    const generated = generateRuleTemplate(templateId.value, {
      hostname: templateHost.value,
      path: 'private',
      port: 8443,
      queryParameter: 'token',
      scheme: 'https',
    })
    draft.matcherType = generated.matcherType
    draft.pattern = generated.pattern
    draft.flags = generated.flags
    testerStatus.value = t('templateApplied')
  } catch (error) {
    testerStatus.value = error instanceof Error ? error.message : String(error)
  }
}

const runRegexTest = async (): Promise<void> => {
  testerStatus.value = t('testingLocally')
  const result = await tester.test({
    flags: draft.flags,
    lines: testLines.value.split(/\r?\n/).slice(0, 1_000),
    matcherType: draft.matcherType,
    pattern: draft.pattern,
  })
  if (!result.ok) {
    testerStatus.value = result.error.code.replaceAll('_', ' ')
    testRows.value = []
    return
  }
  testRows.value = result.value.rows
  testerStatus.value = `${result.value.rows.length} ${t('linesLabel')}, ${result.value.elapsedMs.toFixed(1)} ${t('millisecondsShort')}. ${t('noNetworkRequest')}`
}

const runRoutingTest = (): void => {
  const snapshot = buildRoutingSnapshot(props.state.config, props.state.overrides, new Date())
  routingResult.value = snapshot.ok
    ? testRouting(snapshot.value, {
        incognito: false,
        now: new Date(),
        platform: props.state.diagnostics.platform,
        tabId: props.state.activeTabId,
        url: routeUrl.value,
      })
    : null
}

const move = (rule: Rule, delta: number): void => {
  const toPosition = rule.position + delta
  if (filtersActive.value || toPosition < 0 || toPosition >= props.state.config.rules.length) {
    return
  }
  emit('command', {
    filtersActive: false,
    ruleId: rule.id,
    toPosition,
    type: 'REORDER_RULE',
  })
}

const drop = (target: Rule): void => {
  if (dragId.value === null || filtersActive.value) return
  emit('command', {
    filtersActive: false,
    ruleId: dragId.value,
    toPosition: target.position,
    type: 'REORDER_RULE',
  })
  dragId.value = null
}

const clearFilters = (): void => {
  search.value = ''
  groupFilter.value = ''
  actionFilter.value = ''
  enabledFilter.value = ''
  compatibilityFilter.value = ''
}

const addGroup = (): void => {
  emit('command', {
    groupId: null,
    name: groupName.value,
    type: 'SAVE_GROUP',
  })
  groupName.value = ''
}

const beginGroupRename = (groupId: string, name: string): void => {
  editingGroupId.value = groupId
  editingGroupName.value = name
}

const saveGroupRename = (): void => {
  if (editingGroupId.value === null) return
  emit('command', {
    groupId: editingGroupId.value,
    name: editingGroupName.value,
    type: 'SAVE_GROUP',
  })
  editingGroupId.value = null
  editingGroupName.value = ''
}

const deleteGroup = (groupId: string, name: string): void => {
  const ruleCount = props.state.config.rules.filter((rule) => rule.groupId === groupId).length
  const destinationGroupId = groupDestinations[groupId] ?? null
  if (ruleCount > 0 && destinationGroupId === null) {
    groupStatus.value = t('chooseDestinationGroup')
    return
  }
  if (
    !window.confirm(
      ruleCount === 0
        ? `${t('deleteGroupPrefix')} “${name}”?`
        : `${t('deleteGroupPrefix')} “${name}” ${t('deleteGroupMovePrefix')} ${String(ruleCount)} ${t('deleteGroupMoveSuffix')}`,
    )
  ) {
    return
  }
  emit('command', {
    confirmed: true,
    destinationGroupId,
    groupId,
    type: 'DELETE_GROUP',
  })
  groupStatus.value = ''
}

watch(() => props.busy, restoreFocus)
</script>

<template>
  <div class="stack">
    <div class="section-heading">
      <div>
        <p class="eyebrow">
          {{ t('firstMatchWins') }}
        </p>
        <h2>{{ t('orderedRules') }}</h2>
        <p>{{ t('orderedRulesDescription') }}</p>
      </div>
      <button
        class="primary"
        type="button"
        :disabled="busy || state.config.groups.length === 0"
        @click="create($event)"
      >
        {{ t('addRule') }}
      </button>
    </div>

    <article class="surface card stack">
      <div class="filter-grid">
        <label>
          {{ t('search') }}
          <input v-model="search" type="search" :placeholder="t('nameOrPattern')" />
        </label>
        <label>
          {{ t('group') }}
          <select v-model="groupFilter">
            <option value="">{{ t('allGroups') }}</option>
            <option v-for="group in state.config.groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
        </label>
        <label>
          {{ t('action') }}
          <select v-model="actionFilter">
            <option value="">{{ t('allActions') }}</option>
            <option value="DIRECT">{{ t('directLabel') }}</option>
            <option value="PROXY">{{ t('proxyLabel') }}</option>
          </select>
        </label>
        <label>
          {{ t('enabled') }}
          <select v-model="enabledFilter">
            <option value="">{{ t('anyState') }}</option>
            <option value="true">{{ t('enabled') }}</option>
            <option value="false">{{ t('disabled') }}</option>
          </select>
        </label>
        <label>
          {{ t('compatibility') }}
          <select v-model="compatibilityFilter">
            <option value="">{{ t('all') }}</option>
            <option value="PORTABLE">{{ t('chromeFirefox') }}</option>
            <option value="FIREFOX_ONLY">{{ t('firefoxOnly') }}</option>
          </select>
        </label>
      </div>
      <div class="button-row">
        <button type="button" @click="clearFilters">
          {{ t('clearFilters') }}
        </button>
        <span v-if="filtersActive" class="notice"> {{ t('clearFiltersToReorder') }} </span>
      </div>
    </article>

    <div v-if="filteredRules.length === 0" class="surface empty-state">
      <strong>{{ t('noMatchingRules') }}</strong>
      <p>{{ t('noMatchingRulesDescription') }}</p>
    </div>
    <ol v-else class="rule-list" :aria-label="t('rulesGlobalOrder')">
      <li
        v-for="rule in filteredRules"
        :key="rule.id"
        class="surface rule-row"
        :draggable="!filtersActive && !busy"
        @dragstart="dragId = rule.id"
        @dragover.prevent
        @drop="drop(rule)"
      >
        <span class="drag-handle" aria-hidden="true"> {{ t('dragHandleSymbol') }} </span>
        <span class="position">{{ rule.position + 1 }}</span>
        <div class="rule-main">
          <div class="rule-title">
            <strong>{{ rule.name }}</strong>
            <span v-if="rule.matcherType === 'FULL_URL'" class="status-pill warning">
              {{ t('firefoxOnly') }}
            </span>
            <span v-if="rule.validity !== 'VALID'" class="status-pill danger">
              {{ rule.validity.replaceAll('_', ' ') }}
            </span>
          </div>
          <code>{{ rule.pattern }}</code>
          <small>
            {{
              state.config.groups.find((group) => group.id === rule.groupId)?.name ??
              t('missingGroup')
            }}
            · {{ rule.action.type }}
            {{
              rule.action.targetProxyProfileId
                ? `· ${
                    state.config.profiles.find(
                      (profile) => profile.id === rule.action.targetProxyProfileId,
                    )?.name ?? t('missingProfile')
                  }`
                : ''
            }}
          </small>
        </div>
        <label class="switch-label">
          <span class="sr-only">{{ t('enable') }} {{ rule.name }}</span>
          <input
            type="checkbox"
            :checked="rule.enabled"
            :disabled="busy"
            @change="
              emit('command', {
                enabled: ($event.target as HTMLInputElement).checked,
                ruleId: rule.id,
                type: 'SET_RULE_ENABLED',
              })
            "
          />
        </label>
        <div class="row-actions">
          <button
            type="button"
            :disabled="busy || filtersActive || rule.position === 0"
            :aria-label="`${t('move')} ${rule.name} ${t('up')}`"
            @click="move(rule, -1)"
          >
            {{ t('upSymbol') }}
          </button>
          <button
            type="button"
            :disabled="busy || filtersActive || rule.position === state.config.rules.length - 1"
            :aria-label="`${t('move')} ${rule.name} ${t('down')}`"
            @click="move(rule, 1)"
          >
            {{ t('downSymbol') }}
          </button>
          <button type="button" @click="edit(rule, $event)">
            {{ t('edit') }}
          </button>
          <button
            type="button"
            @click="
              emit('command', {
                ruleId: rule.id,
                type: 'DUPLICATE_RULE',
              })
            "
          >
            {{ t('duplicate') }}
          </button>
          <button
            class="danger-text"
            type="button"
            @click="
              emit('command', {
                ruleId: rule.id,
                type: 'DELETE_RULE',
              })
            "
          >
            {{ t('delete') }}
          </button>
        </div>
      </li>
    </ol>

    <form v-if="formOpen" class="surface card stack editor" @submit.prevent="save">
      <div class="section-heading">
        <h3>{{ editingId === null ? t('addRule') : t('editRule') }}</h3>
        <button type="button" @click="closeEditor">
          {{ t('close') }}
        </button>
      </div>
      <div class="form-grid">
        <label>
          {{ t('name') }}
          <input ref="editorNameInput" v-model="draft.name" maxlength="256" required />
        </label>
        <label>
          {{ t('group') }}
          <select v-model="draft.groupId" required>
            <option v-for="group in state.config.groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
        </label>
        <label>
          {{ t('matcherTarget') }}
          <select v-model="draft.matcherType">
            <option value="ORIGIN">{{ t('originPortable') }}</option>
            <option value="FULL_URL">{{ t('fullUrlFirefoxOnly') }}</option>
          </select>
        </label>
        <label>
          {{ t('flags') }}
          <input v-model="draft.flags" maxlength="2" pattern="[im]*" />
        </label>
      </div>
      <label>
        {{ t('description') }}
        <textarea v-model="draft.description" rows="2" maxlength="4096" />
      </label>
      <label>
        {{ t('regularExpression') }}
        <textarea v-model="draft.pattern" rows="3" maxlength="2048" spellcheck="false" required />
      </label>
      <p class="notice">
        {{ t('regexGuidance') }}
      </p>
      <div class="form-grid">
        <label>
          {{ t('template') }}
          <select v-model="templateId">
            <option value="EXACT_HOSTNAME">{{ t('exactHostname') }}</option>
            <option value="DOMAIN_AND_SUBDOMAINS">{{ t('domainSubdomains') }}</option>
            <option value="EXACT_ORIGIN">{{ t('exactOrigin') }}</option>
            <option value="HTTP_ONLY">{{ t('httpOnly') }}</option>
            <option value="HTTPS_ONLY">{{ t('httpsOnly') }}</option>
            <option value="CUSTOM_PORT">{{ t('customPort') }}</option>
            <option value="LOCALHOST">{{ t('localhost') }}</option>
            <option value="PRIVATE_IPV4">{{ t('privateIpv4') }}</option>
            <option value="FIREFOX_URL_PATH">{{ t('firefoxUrlPath') }}</option>
            <option value="FIREFOX_QUERY_PARAMETER">{{ t('firefoxQueryParameter') }}</option>
          </select>
        </label>
        <label>
          {{ t('templateHostname') }}
          <input v-model="templateHost" />
        </label>
        <button type="button" @click="applyTemplate">
          {{ t('generateEditablePattern') }}
        </button>
      </div>
      <div class="form-grid">
        <label>
          {{ t('action') }}
          <select v-model="draft.actionType">
            <option value="DIRECT">{{ t('directLabel') }}</option>
            <option value="PROXY">{{ t('proxyLabel') }}</option>
          </select>
        </label>
        <label v-if="draft.actionType === 'PROXY'">
          {{ t('proxyProfile') }}
          <select v-model="draft.targetProxyProfileId" required>
            <option value="" disabled>{{ t('selectProfile') }}</option>
            <option v-for="profile in state.config.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>
      </div>
      <label class="check-row">
        <input v-model="draft.enabled" type="checkbox" />
        <span>{{ t('enabled') }}</span>
      </label>

      <details class="tester-panel">
        <summary>{{ t('singleMultipleTester') }}</summary>
        <p>{{ t('testerPrivacyDescription') }}</p>
        <label>
          {{ t('urlsOnePerLine') }}
          <textarea v-model="testLines" rows="5" />
        </label>
        <div class="button-row">
          <button type="button" @click="runRegexTest">
            {{ t('testPattern') }}
          </button>
          <button type="button" @click="tester.cancel()">
            {{ t('cancel') }}
          </button>
          <span class="muted" aria-live="polite">
            {{ testerStatus }}
          </span>
        </div>
        <ul class="test-results">
          <li v-for="row in testRows" :key="row.input">
            <strong>
              {{ row.errorCode ?? (row.matched ? t('match') : t('noMatch')) }}
            </strong>
            <code>{{ row.normalizedTarget ?? row.input }}</code>
          </li>
        </ul>
      </details>

      <div class="button-row">
        <button class="primary" type="submit" :disabled="busy">
          {{ t('saveRule') }}
        </button>
        <button type="button" @click="closeEditor">
          {{ t('cancel') }}
        </button>
      </div>
    </form>

    <article class="surface card stack">
      <div>
        <p class="eyebrow">
          {{ t('organization') }}
        </p>
        <h3>{{ t('groups') }}</h3>
        <p>{{ t('groupsPriorityDescription') }}</p>
      </div>
      <div class="stack">
        <div v-for="group in state.config.groups" :key="group.id" class="surface group-row">
          <form
            v-if="editingGroupId === group.id"
            class="inline-form"
            @submit.prevent="saveGroupRename"
          >
            <label>
              {{ t('rename') }} {{ group.name }}
              <input v-model="editingGroupName" required />
            </label>
            <button type="submit" :disabled="busy">
              {{ t('saveName') }}
            </button>
            <button type="button" @click="editingGroupId = null">
              {{ t('cancel') }}
            </button>
          </form>
          <template v-else>
            <div>
              <strong>{{ group.name }}</strong>
              <small>
                {{ state.config.rules.filter((rule) => rule.groupId === group.id).length }}
                {{ t('rulesCountSuffix') }}
                {{ group.isPreset ? `· ${t('preset')}` : '' }}
              </small>
            </div>
            <div class="row-actions">
              <button
                type="button"
                :disabled="busy"
                :aria-label="`${t('rename')} ${group.name}`"
                @click="beginGroupRename(group.id, group.name)"
              >
                {{ t('rename') }}
              </button>
              <label
                v-if="state.config.rules.some((rule) => rule.groupId === group.id)"
                class="destination-select"
              >
                {{ t('moveRulesTo') }}
                <select v-model="groupDestinations[group.id]" :disabled="busy">
                  <option value="" disabled>
                    {{ t('selectGroup') }}
                  </option>
                  <option
                    v-for="destination in state.config.groups.filter(
                      (candidate) => candidate.id !== group.id,
                    )"
                    :key="destination.id"
                    :value="destination.id"
                  >
                    {{ destination.name }}
                  </option>
                </select>
              </label>
              <button
                class="danger-text"
                type="button"
                :disabled="
                  busy ||
                  (state.config.groups.length === 1 &&
                    state.config.rules.some((rule) => rule.groupId === group.id))
                "
                :aria-label="`${t('delete')} ${group.name}`"
                @click="deleteGroup(group.id, group.name)"
              >
                {{ t('delete') }}
              </button>
            </div>
          </template>
        </div>
      </div>
      <p v-if="groupStatus" class="notice danger" role="alert">
        {{ groupStatus }}
      </p>
      <form class="inline-form" @submit.prevent="addGroup">
        <label>
          {{ t('newGroupName') }}
          <input v-model="groupName" required />
        </label>
        <button type="submit" :disabled="busy">
          {{ t('addGroup') }}
        </button>
      </form>
    </article>

    <article class="surface card stack">
      <div>
        <p class="eyebrow">
          {{ t('authoritativeResolver') }}
        </p>
        <h3>{{ t('globalRoutingTester') }}</h3>
      </div>
      <div class="inline-form">
        <label>
          {{ t('url') }}
          <input v-model="routeUrl" type="url" />
        </label>
        <button type="button" @click="runRoutingTest">
          {{ t('resolveRoute') }}
        </button>
      </div>
      <div v-if="routingResult" class="route-result">
        <strong>
          {{ routingResult.action }} · {{ routingResult.source }}
          {{ routingResult.profileName ? `· ${routingResult.profileName}` : '' }}
        </strong>
        <code>{{ routingResult.normalizedTarget }}</code>
        <ol>
          <li v-for="row in routingResult.trace" :key="row.ruleId">
            {{ row.ruleName }} — {{ row.status.replaceAll('_', ' ') }}
          </li>
        </ol>
      </div>
    </article>
  </div>
</template>
