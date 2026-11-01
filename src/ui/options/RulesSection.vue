<script setup lang="ts">
import {
  ChevronDown,
  ChevronUp,
  CopyPlus,
  FlaskConical,
  GripVertical,
  Info,
  NotebookText,
  Pencil,
  Play,
  Plus,
  Route,
  Search,
  SlidersHorizontal,
  SquarePen,
  TimerOff,
  TimerReset,
  Trash2,
  WandSparkles,
} from '@lucide/vue'
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
import type { MatcherType, ProxyProfile, Rule } from '../../domain/types/entities'
import { t, type MessageKey } from '../../i18n/messages'
import type { TemporaryDisableDuration } from '../../application/rules/rule-disable-service'
import { isRuleTemporarilyDisabled } from '../../domain/rules/rule'
import {
  decisionActionLabel,
  decisionSourceLabel,
  errorText,
  ruleTraceStatusLabel,
  ruleValidityLabel,
} from '../labels'
import { confirmController } from '../confirm/confirm-controller'
import { createRegexWorker } from '../runtime/regex-worker-factory'
import IconButton from '../components/IconButton.vue'
import Modal from '../components/Modal.vue'
import Tabs from '../components/Tabs.vue'
import OverflowMenu from '../components/OverflowMenu.vue'
import ProfileChip from '../components/ProfileChip.vue'
import HelpTip from '../components/HelpTip.vue'

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

const ruleProfile = (rule: Rule): ProxyProfile | null =>
  rule.action.type === 'PROXY'
    ? (props.state.config.profiles.find(
        (candidate) => candidate.id === rule.action.targetProxyProfileId,
      ) ?? null)
    : null

const TEMPORARY_DISABLE_CHOICES: readonly {
  readonly duration: TemporaryDisableDuration
  readonly label: MessageKey
}[] = [
  { duration: 'MINUTES_5', label: 'disableFor5Minutes' },
  { duration: 'MINUTES_15', label: 'disableFor15Minutes' },
  { duration: 'HOUR_1', label: 'disableFor1Hour' },
  { duration: 'UNTIL_RESTART', label: 'disableUntilRestart' },
]

/** Badge text while a session temporary disable is in effect, otherwise null. */
const temporaryDisableText = (rule: Rule): string | null => {
  if (!isRuleTemporarilyDisabled(rule, new Date())) return null
  const until = rule.temporaryDisable?.until ?? null
  return until === null
    ? t('disabledUntilRestart')
    : t(
        'disabledUntilTime',
        new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      )
}

const ruleTabs = [
  { icon: SquarePen, id: 'rule', label: t('tabRule') },
  { icon: FlaskConical, id: 'test', label: t('tabTest') },
  { icon: NotebookText, id: 'notes', label: t('tabNotes') },
] as const

const moreFiltersOpen = shallowRef(false)
const expandedPatterns = shallowRef<ReadonlySet<string>>(new Set())
const selectedRuleIds = shallowRef<ReadonlySet<string>>(new Set())

watch(
  () => props.state.config.rules,
  (rules) => {
    const existing = new Set<string>(rules.map((rule) => rule.id))
    selectedRuleIds.value = new Set([...selectedRuleIds.value].filter((id) => existing.has(id)))
  },
)

const toggleSet = (set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> => {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

const selectedInOrder = (): string[] =>
  [...props.state.config.rules]
    .sort((left, right) => left.position - right.position)
    .filter((rule) => selectedRuleIds.value.has(rule.id))
    .map((rule) => rule.id)

const selectAllShown = (): void => {
  selectedRuleIds.value = new Set([
    ...selectedRuleIds.value,
    ...filteredRules.value.map((rule) => rule.id),
  ])
}

const setSelectedEnabled = (enabled: boolean): void => {
  emit('command', { enabled, ruleIds: selectedInOrder(), type: 'SET_RULES_ENABLED' })
}

const deleteSelected = async (): Promise<void> => {
  const ruleIds = selectedInOrder()
  const confirmed = await confirmController.destructive(
    {
      confirmLabel: t('delete'),
      message: t('deleteRulesMessage'),
      title: t('deleteRulesTitle', String(ruleIds.length)),
    },
    props.state.config.general.confirmDangerousActions,
  )
  if (confirmed) emit('command', { ruleIds, type: 'DELETE_RULES' })
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
  const source = event.currentTarget as HTMLElement
  // A menu item disappears when the menu closes; focus returns to the menu button instead.
  editorActivator =
    source.closest('.overflow-menu')?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? source
  editingId.value = rule.id
  replaceDraft(copyRule(rule))
  formOpen.value = true
  void nextTick(() => editorNameInput.value?.focus())
}

const removeRule = async (rule: Rule): Promise<void> => {
  const confirmed = await confirmController.destructive(
    {
      code: rule.pattern,
      confirmLabel: t('delete'),
      message: t('deleteRuleMessage', rule.name),
      title: t('deleteRuleTitle'),
    },
    props.state.config.general.confirmDangerousActions,
  )
  if (confirmed) emit('command', { ruleId: rule.id, type: 'DELETE_RULE' })
}

const save = async (): Promise<void> => {
  if (!routeSelectionValid.value) return
  if (
    draft.matcherType === 'FULL_URL' &&
    props.state.diagnostics.platform === 'CHROMIUM' &&
    !(await confirmController.request({
      confirmLabel: t('saveRule'),
      message: t('fullUrlSaveWarning'),
      title: t('fullUrlSaveTitle'),
    }))
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
  } catch {
    testerStatus.value =
      templateId.value === 'DOMAIN_SUFFIXES' ? t('invalidDomainSuffixes') : t('templateInvalid')
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
    testerStatus.value = errorText(result.error)
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
        <h2 class="title-with-tip">
          {{ t('orderedRules') }}
          <HelpTip :text="t('helpRulesBody1')" article="rules" />
        </h2>
        <p>{{ t('orderedRulesDescription') }}</p>
      </div>
      <button class="primary" type="button" :disabled="busy" @click="create($event)">
        <Plus :size="16" aria-hidden="true" />
        {{ t('addRule') }}
      </button>
    </div>

    <div class="stack rule-toolbar">
      <div class="rule-filter-row">
        <label class="search-field">
          <span class="sr-only">{{ t('search') }}</span>
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            :placeholder="t('nameOrPattern')"
            :aria-label="t('search')"
          />
        </label>
        <button
          type="button"
          :aria-expanded="moreFiltersOpen ? 'true' : 'false'"
          @click="moreFiltersOpen = !moreFiltersOpen"
        >
          <SlidersHorizontal :size="16" aria-hidden="true" />
          {{ moreFiltersOpen ? t('fewerFilters') : t('moreFilters') }}
        </button>
      </div>
      <div v-if="moreFiltersOpen" class="filter-grid">
        <label>
          {{ t('action') }}
          <select v-model="actionFilter" name="rule-action-filter" :aria-label="t('action')">
            <option value="">{{ t('allActions') }}</option>
            <option value="DIRECT">{{ t('directLabel') }}</option>
            <option value="PROXY">{{ t('proxyLabel') }}</option>
          </select>
        </label>
        <label>
          {{ t('proxyProfile') }}
          <select
            v-model="profileFilter"
            name="rule-profile-filter"
            :aria-label="t('proxyProfile')"
          >
            <option value="">{{ t('allProxyProfiles') }}</option>
            <option v-for="profile in state.config.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>
        <label>
          {{ t('enabled') }}
          <select v-model="enabledFilter" name="rule-enabled-filter" :aria-label="t('enabled')">
            <option value="">{{ t('anyState') }}</option>
            <option value="true">{{ t('enabled') }}</option>
            <option value="false">{{ t('disabled') }}</option>
          </select>
        </label>
        <label>
          {{ t('compatibility') }}
          <select
            v-model="compatibilityFilter"
            name="rule-compatibility-filter"
            :aria-label="t('compatibility')"
          >
            <option value="">{{ t('all') }}</option>
            <option value="PORTABLE">{{ t('chromeFirefox') }}</option>
            <option value="FIREFOX_ONLY">{{ t('firefoxOnly') }}</option>
          </select>
        </label>
      </div>
      <div class="button-row">
        <span aria-live="polite">
          {{ t('showingCount', [String(filteredRules.length), String(state.config.rules.length)]) }}
        </span>
        <button v-if="filtersActive" type="button" @click="clearFilters">
          {{ t('clearFilters') }}
        </button>
        <span v-if="filtersActive" class="notice"> {{ t('clearFiltersToReorder') }} </span>
        <button type="button" :disabled="filteredRules.length === 0" @click="selectAllShown">
          {{ t('selectAllShown') }}
        </button>
        <template v-if="selectedRuleIds.size > 0">
          <button type="button" @click="selectedRuleIds = new Set()">
            {{ t('clearSelection') }}
          </button>
          <button type="button" :disabled="busy" @click="setSelectedEnabled(true)">
            {{ t('enableSelected', String(selectedRuleIds.size)) }}
          </button>
          <button type="button" :disabled="busy" @click="setSelectedEnabled(false)">
            {{ t('disableSelected', String(selectedRuleIds.size)) }}
          </button>
          <button class="danger-text" type="button" :disabled="busy" @click="void deleteSelected()">
            {{ t('deleteSelected', String(selectedRuleIds.size)) }}
          </button>
        </template>
      </div>
    </div>

    <div v-if="filteredRules.length === 0" class="surface empty-state">
      <strong>{{ t('noMatchingRules') }}</strong>
      <p>{{ t('noMatchingRulesDescription') }}</p>
    </div>
    <ol v-else class="rule-list" :aria-label="t('rulesGlobalOrder')">
      <li
        v-for="rule in filteredRules"
        :key="rule.id"
        class="surface rule-row"
        :class="{ 'rule-disabled': !rule.enabled }"
        :draggable="!filtersActive && !busy"
        @dragstart="dragId = rule.id"
        @dragover.prevent
        @drop="drop(rule)"
      >
        <input
          type="checkbox"
          name="rule-select"
          :checked="selectedRuleIds.has(rule.id)"
          :aria-label="t('selectRuleNamed', rule.name)"
          @change="
            selectedRuleIds = toggleSet(
              selectedRuleIds,
              rule.id,
              ($event.target as HTMLInputElement).checked,
            )
          "
        />
        <GripVertical class="drag-handle" :size="16" aria-hidden="true" />
        <span class="position">{{ rule.position + 1 }}</span>
        <div class="rule-main">
          <div class="rule-title">
            <strong>{{ rule.name }}</strong>
            <ProfileChip
              :profile="ruleProfile(rule)"
              :missing="rule.action.type === 'PROXY' && ruleProfile(rule) === null"
            />
            <span v-if="rule.matcherType === 'FULL_URL'" class="status-pill warning">
              {{ t('firefoxOnly') }}
            </span>
            <span v-if="temporaryDisableText(rule)" class="status-pill warning temp-disabled">
              {{ temporaryDisableText(rule) }}
            </span>
            <span v-if="rule.validity !== 'VALID'" class="status-pill danger">
              {{ ruleValidityLabel(rule.validity) }}
            </span>
          </div>
          <div class="pattern-line">
            <code class="rule-pattern" :class="{ expanded: expandedPatterns.has(rule.id) }">{{
              rule.pattern
            }}</code>
            <button
              v-if="rule.pattern.length > 60"
              class="link-button pattern-toggle"
              type="button"
              :aria-expanded="expandedPatterns.has(rule.id) ? 'true' : 'false'"
              @click="
                expandedPatterns = toggleSet(
                  expandedPatterns,
                  rule.id,
                  !expandedPatterns.has(rule.id),
                )
              "
            >
              {{ expandedPatterns.has(rule.id) ? t('hideFullPattern') : t('showFullPattern') }}
            </button>
          </div>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            :checked="rule.enabled"
            :disabled="busy"
            :aria-label="t('enableRule', rule.name)"
            @change="
              emit('command', {
                enabled: ($event.target as HTMLInputElement).checked,
                ruleId: rule.id,
                type: 'SET_RULE_ENABLED',
              })
            "
          />
          <span class="switch-text" aria-hidden="true">{{
            rule.enabled ? t('enabled') : t('disabled')
          }}</span>
        </label>
        <div class="row-actions">
          <button
            type="button"
            class="ghost icon-button small"
            :disabled="busy || filtersActive || rule.position === 0"
            :aria-label="t('moveRuleUp', rule.name)"
            @click="move(rule, -1)"
          >
            <ChevronUp :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="ghost icon-button small"
            :disabled="busy || filtersActive || rule.position === state.config.rules.length - 1"
            :aria-label="t('moveRuleDown', rule.name)"
            @click="move(rule, 1)"
          >
            <ChevronDown :size="16" aria-hidden="true" />
          </button>
          <IconButton
            :icon="Pencil"
            size="small"
            :label="t('editRuleNamed', rule.name)"
            @click="edit(rule, $event)"
          />
          <OverflowMenu :label="t('ruleActionsFor', rule.name)">
            <button
              role="menuitem"
              type="button"
              @click="emit('command', { ruleId: rule.id, type: 'DUPLICATE_RULE' })"
            >
              <CopyPlus :size="16" aria-hidden="true" />
              {{ t('duplicate') }}
            </button>
            <template v-if="temporaryDisableText(rule) === null">
              <button
                v-for="choice in TEMPORARY_DISABLE_CHOICES"
                :key="choice.duration"
                role="menuitem"
                type="button"
                :disabled="busy"
                @click="
                  emit('command', {
                    duration: choice.duration,
                    ruleId: rule.id,
                    type: 'SET_RULE_TEMPORARY_DISABLE',
                  })
                "
              >
                <TimerOff :size="16" aria-hidden="true" />
                {{ t(choice.label) }}
              </button>
            </template>
            <button
              v-else
              role="menuitem"
              type="button"
              :disabled="busy"
              @click="emit('command', { ruleId: rule.id, type: 'CLEAR_RULE_TEMPORARY_DISABLE' })"
            >
              <TimerReset :size="16" aria-hidden="true" />
              {{ t('reenableNow') }}
            </button>
            <button
              role="menuitem"
              class="danger-text"
              type="button"
              @click="void removeRule(rule)"
            >
              <Trash2 :size="16" aria-hidden="true" />
              {{ t('delete') }}
            </button>
          </OverflowMenu>
        </div>
      </li>
    </ol>

    <Modal
      :open="formOpen"
      :title="editingId === null ? t('addRule') : t('editRule')"
      size="large"
      fixed-height
      @close="closeEditor"
    >
      <form id="rule-form" @submit.prevent="void save()">
        <Tabs :label="t('ruleEditorTabs')" :tabs="ruleTabs">
          <template #rule>
            <div class="rule-editor">
              <section class="editor-section">
                <div class="name-row">
                  <label>
                    {{ t('name') }}
                    <input ref="editorNameInput" v-model="draft.name" maxlength="256" required />
                  </label>
                  <label class="switch">
                    <input v-model="draft.enabled" type="checkbox" role="switch" />
                    {{ t('enabled') }}
                  </label>
                </div>
              </section>

              <section class="editor-section">
                <h3>{{ t('editorMatch') }}</h3>
                <div class="match-row">
                  <div class="field">
                    <span class="field-label">
                      <label for="rule-matcher">{{ t('matcherTarget') }}</label>
                      <HelpTip :text="t('tipMatcher')" article="limits" />
                    </span>
                    <select id="rule-matcher" v-model="draft.matcherType">
                      <option value="ORIGIN">
                        {{ t('originPortable') }}
                      </option>
                      <option value="FULL_URL">
                        {{ t('fullUrlFirefoxOnly') }}
                      </option>
                    </select>
                  </div>
                  <label>
                    {{ t('flags') }}
                    <input v-model="draft.flags" maxlength="2" pattern="[im]*" />
                  </label>
                </div>
                <div class="field">
                  <span class="field-label">
                    <label for="rule-pattern">{{ t('regularExpression') }}</label>
                    <HelpTip :text="t('tipRegex')" article="rules" />
                  </span>
                  <textarea
                    id="rule-pattern"
                    v-model="draft.pattern"
                    class="pattern-input"
                    rows="3"
                    maxlength="2048"
                    spellcheck="false"
                    required
                  />
                </div>
                <p class="notice">
                  <Info :size="16" aria-hidden="true" />
                  {{ t('regexGuidance') }}
                </p>
                <div class="template-box">
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
                      <option value="FIREFOX_QUERY_PARAMETER">
                        {{ t('firefoxQueryParameter') }}
                      </option>
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
                    <WandSparkles :size="16" aria-hidden="true" />
                    {{ t('generateEditablePattern') }}
                  </button>
                </div>
              </section>

              <section class="editor-section">
                <h3>{{ t('editorRoute') }}</h3>
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
                <p v-if="routeSelectionMissing" class="notice danger" role="alert">
                  {{ t('chooseAvailableRoute') }}
                </p>
              </section>
            </div>
          </template>
          <template #test>
            <div class="stack">
              <p class="muted">
                {{ t('testerPrivacyDescription') }}
              </p>
              <label>
                {{ t('urlsOnePerLine') }}
                <textarea v-model="testLines" rows="4" />
              </label>
              <div class="button-row">
                <button type="button" @click="runRegexTest">
                  <FlaskConical :size="16" aria-hidden="true" />
                  {{ t('testPattern') }}
                </button>
                <button type="button" class="ghost" @click="tester.cancel()">
                  {{ t('cancel') }}
                </button>
                <span class="muted" aria-live="polite">
                  {{ testerStatus }}
                </span>
              </div>
              <ul class="test-results">
                <li v-for="row in testRows" :key="row.input">
                  <strong>
                    {{
                      row.errorCode === null
                        ? row.matched
                          ? t('match')
                          : t('noMatch')
                        : errorText({ code: row.errorCode })
                    }}
                  </strong>
                  <code>{{ row.normalizedTarget ?? row.input }}</code>
                </li>
              </ul>
            </div>
          </template>
          <template #notes>
            <label>
              {{ t('description') }}
              <textarea v-model="draft.description" rows="6" maxlength="4096" />
            </label>
          </template>
        </Tabs>
      </form>
      <template #footer>
        <button type="button" @click="closeEditor">
          {{ t('cancel') }}
        </button>
        <button
          class="primary"
          type="submit"
          form="rule-form"
          :disabled="busy || !routeSelectionValid"
        >
          {{ t('saveRule') }}
        </button>
      </template>
    </Modal>

    <article class="surface card stack">
      <div class="card-heading">
        <Route :size="18" aria-hidden="true" />
        <div>
          <h3>{{ t('globalRoutingTester') }}</h3>
          <small>{{ t('authoritativeResolver') }}</small>
        </div>
      </div>
      <div class="inline-form">
        <label>
          {{ t('url') }}
          <input v-model="routeUrl" type="url" />
        </label>
        <button type="button" @click="runRoutingTest">
          <Play :size="16" aria-hidden="true" />
          {{ t('resolveRoute') }}
        </button>
      </div>
      <div v-if="routingResult" class="route-result">
        <strong>
          {{ decisionActionLabel(routingResult.action) }} ·
          {{ decisionSourceLabel(routingResult.source) }}
          {{ routingResult.profileName ? `· ${routingResult.profileName}` : '' }}
        </strong>
        <code>{{ routingResult.normalizedTarget }}</code>
        <ol>
          <li v-for="row in routingResult.trace" :key="row.ruleId">
            {{ row.ruleName }} — {{ ruleTraceStatusLabel(row.status) }}
          </li>
        </ol>
      </div>
    </article>
  </div>
</template>

<style scoped>
.rule-toolbar {
  gap: var(--space-3);
}

.search-field {
  position: relative;
  display: block;
  color: var(--color-muted);
}

.search-field svg {
  position: absolute;
  top: 50%;
  left: 11px;
  transform: translateY(-50%);
}

.search-field input {
  padding-left: 34px;
}

.card-heading {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  color: var(--color-primary);
}

.card-heading div {
  display: grid;
  color: var(--color-text);
}

.rule-editor {
  display: grid;
  gap: var(--space-5);
}

.editor-section {
  display: grid;
  gap: var(--space-3);
}

.name-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: end;
}

.name-row .switch {
  min-height: var(--control-height);
}

.match-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: var(--space-3);
}

.pattern-input {
  font-family: var(--font-mono);
  font-size: 13px;
}

.template-box {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: end;
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius);
  background: var(--color-surface-2);
}

.advanced summary,
.tester-panel summary {
  color: var(--color-muted);
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 640px) {
  .template-box,
  .match-row {
    grid-template-columns: 1fr;
  }
}
</style>
