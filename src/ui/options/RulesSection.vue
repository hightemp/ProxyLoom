<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, watch } from 'vue'

import { RegexBatchTester } from '../../application/regex-tester/regex-batch-tester'
import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import {
  testRouting,
  type RoutingTestResult,
} from '../../application/routing-tester/routing-tester'
import { buildRoutingSnapshot } from '../../domain/routing/snapshot'
import {
  generateRuleTemplate,
  NAMED_RULE_TEMPLATE_PRESETS,
  type RuleTemplateId,
} from '../../domain/rules/templates'
import type { MatcherType, Rule } from '../../domain/types/entities'
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
  matcherType: MatcherType
  pattern: string
  flags: string
  routeTarget: RuleRouteTarget
}

const PROFILE_ROUTE_PREFIX = 'PROFILE:'
type RuleRouteTarget = '' | 'DIRECT' | `PROFILE:${string}`

const profileRouteTarget = (profileId: string): RuleRouteTarget =>
  `${PROFILE_ROUTE_PREFIX}${profileId}`

const profileIdFromRouteTarget = (routeTarget: RuleRouteTarget): string | null =>
  routeTarget.startsWith(PROFILE_ROUTE_PREFIX)
    ? routeTarget.slice(PROFILE_ROUTE_PREFIX.length)
    : null

const blankRule = (): RuleDraft => ({
  description: '',
  enabled: true,
  flags: 'i',
  matcherType: 'ORIGIN',
  name: '',
  pattern: '^https://example\\.com/$',
  routeTarget: '',
})

const copyRule = (rule: Rule): RuleDraft => ({
  description: rule.description,
  enabled: rule.enabled,
  flags: rule.flags,
  matcherType: rule.matcherType,
  name: rule.name,
  pattern: rule.pattern,
  routeTarget:
    rule.action.type === 'DIRECT' || rule.action.targetProxyProfileId === null
      ? 'DIRECT'
      : profileRouteTarget(rule.action.targetProxyProfileId),
})

const editingId = shallowRef<string | null>(null)
const formOpen = shallowRef(false)
const draft = reactive<RuleDraft>(blankRule())
const editorNameInput = shallowRef<HTMLInputElement | null>(null)
const search = shallowRef('')
const actionFilter = shallowRef('')
const profileFilter = shallowRef('')
const enabledFilter = shallowRef('')
const compatibilityFilter = shallowRef('')
const dragId = shallowRef<string | null>(null)
const templateId = shallowRef<RuleTemplateId>('EXACT_HOSTNAME')
const templateHost = shallowRef('example.com')
const templateDomainSuffixes = shallowRef('.ru, .рф, .de')
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
    actionFilter.value !== '' ||
    profileFilter.value !== '' ||
    enabledFilter.value !== '' ||
    compatibilityFilter.value !== '',
)

const selectedRouteProfileId = computed(() => profileIdFromRouteTarget(draft.routeTarget))
const selectedRouteProfileExists = computed(
  () =>
    selectedRouteProfileId.value !== null &&
    props.state.config.profiles.some((profile) => profile.id === selectedRouteProfileId.value),
)
const routeSelectionMissing = computed(
  () => selectedRouteProfileId.value !== null && !selectedRouteProfileExists.value,
)
const routeSelectionValid = computed(
  () => draft.routeTarget === 'DIRECT' || selectedRouteProfileExists.value,
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
        (actionFilter.value === '' || rule.action.type === actionFilter.value) &&
        (profileFilter.value === '' || rule.action.targetProxyProfileId === profileFilter.value) &&
        (enabledFilter.value === '' || String(rule.enabled) === enabledFilter.value) &&
        (compatibilityFilter.value === '' ||
          (compatibilityFilter.value === 'FIREFOX_ONLY'
            ? rule.matcherType === 'FULL_URL'
            : rule.matcherType === 'ORIGIN')),
    )
})

const ruleRouteLabel = (rule: Rule): string => {
  if (rule.action.type === 'DIRECT') return t('directConnection')
  const profile = props.state.config.profiles.find(
    (candidate) => candidate.id === rule.action.targetProxyProfileId,
  )
  return profile === undefined ? t('missingProxyRoute') : t('viaProxy', profile.name)
}

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
  if (!routeSelectionValid.value) return
  if (
    draft.matcherType === 'FULL_URL' &&
    props.state.diagnostics.platform === 'CHROMIUM' &&
    !window.confirm(t('fullUrlSaveWarning'))
  ) {
    return
  }
  emit('command', {
    input: {
      action:
        draft.routeTarget === 'DIRECT'
          ? { targetProxyProfileId: null, type: 'DIRECT' }
          : {
              targetProxyProfileId:
                selectedRouteProfileId.value as Rule['action']['targetProxyProfileId'],
              type: 'PROXY',
            },
      description: draft.description,
      enabled: draft.enabled,
      flags: draft.flags,
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
      domainSuffixes: templateDomainSuffixes.value,
      hostname: templateHost.value,
      path: 'private',
      port: 8443,
      queryParameter: 'token',
      scheme: 'https',
    })
    draft.matcherType = generated.matcherType
    draft.pattern = generated.pattern
    draft.flags = generated.flags
    const preset = NAMED_RULE_TEMPLATE_PRESETS[templateId.value]
    if (preset !== undefined) {
      draft.name = preset.name
      draft.description = preset.description
      testLines.value = preset.testUrls.join('\n')
    }
    testerStatus.value = t('templateApplied')
  } catch (error) {
    testerStatus.value =
      templateId.value === 'DOMAIN_SUFFIXES'
        ? t('invalidDomainSuffixes')
        : error instanceof Error
          ? error.message
          : String(error)
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
  actionFilter.value = ''
  profileFilter.value = ''
  enabledFilter.value = ''
  compatibilityFilter.value = ''
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
      <button class="primary" type="button" :disabled="busy" @click="create($event)">
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
          {{ t('action') }}
          <select v-model="actionFilter" :aria-label="t('action')">
            <option value="">{{ t('allActions') }}</option>
            <option value="DIRECT">{{ t('directLabel') }}</option>
            <option value="PROXY">{{ t('proxyLabel') }}</option>
          </select>
        </label>
        <label>
          {{ t('proxyProfile') }}
          <select v-model="profileFilter" :aria-label="t('proxyProfile')">
            <option value="">{{ t('allProxyProfiles') }}</option>
            <option v-for="profile in state.config.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>
        <label>
          {{ t('enabled') }}
          <select v-model="enabledFilter" :aria-label="t('enabled')">
            <option value="">{{ t('anyState') }}</option>
            <option value="true">{{ t('enabled') }}</option>
            <option value="false">{{ t('disabled') }}</option>
          </select>
        </label>
        <label>
          {{ t('compatibility') }}
          <select v-model="compatibilityFilter" :aria-label="t('compatibility')">
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
            {{ ruleRouteLabel(rule) }}
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
          <select v-model="templateId" :aria-label="t('template')">
            <option value="EXACT_HOSTNAME">{{ t('exactHostname') }}</option>
            <option value="DOMAIN_AND_SUBDOMAINS">{{ t('domainSubdomains') }}</option>
            <option value="DOMAIN_SUFFIXES">{{ t('domainSuffixes') }}</option>
            <option value="RUSSIAN_DOMAINS">{{ t('russianSitesExample') }}</option>
            <option value="SOCIAL_NETWORKS">{{ t('socialNetworksExample') }}</option>
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
        <label
          v-if="
            templateId !== 'DOMAIN_SUFFIXES' &&
            templateId !== 'RUSSIAN_DOMAINS' &&
            templateId !== 'SOCIAL_NETWORKS'
          "
        >
          {{ t('templateHostname') }}
          <input v-model="templateHost" />
        </label>
        <label v-else-if="templateId === 'DOMAIN_SUFFIXES'">
          {{ t('domainSuffixes') }}
          <textarea
            v-model="templateDomainSuffixes"
            rows="2"
            :placeholder="t('domainSuffixesPlaceholder')"
          />
        </label>
        <button type="button" @click="applyTemplate">
          {{ t('generateEditablePattern') }}
        </button>
      </div>
      <label>
        {{ t('routeVia') }}
        <select v-model="draft.routeTarget" required>
          <option value="" disabled>{{ t('selectRoute') }}</option>
          <option value="DIRECT">{{ t('directConnection') }}</option>
          <option v-if="routeSelectionMissing" :value="draft.routeTarget" disabled>
            {{ t('missingProxyRoute') }}
          </option>
          <option
            v-for="profile in state.config.profiles"
            :key="profile.id"
            :value="profileRouteTarget(profile.id)"
          >
            {{ t('proxyRouteOption', profile.name) }}
          </option>
        </select>
      </label>
      <p v-if="routeSelectionMissing" class="notice danger-text" role="alert">
        {{ t('chooseAvailableRoute') }}
      </p>
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
        <button class="primary" type="submit" :disabled="busy || !routeSelectionValid">
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
