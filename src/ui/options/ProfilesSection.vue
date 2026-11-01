<script setup lang="ts">
import {
  Activity,
  Cable,
  CircleCheck,
  CircleStop,
  CircleX,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Globe,
  Link,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  Terminal,
  Trash2,
  Upload,
  User,
} from '@lucide/vue'
import { computed, nextTick, reactive, shallowRef, watch } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type {
  ProxyCheckResult,
  ProxyEndpoint,
  ProxyProfile,
  ProxyTransport,
} from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { confirmController } from '../confirm/confirm-controller'
import {
  formatProfile,
  formatProxyList,
  type ProxyTextFormat,
} from '../../domain/profiles/proxy-format'
import { parseProxyString, type ParsedProxyString } from '../../domain/profiles/proxy-string'
import { copyText } from '../clipboard'
import { runtimeClient } from '../runtime/client'
import { filterProfiles, type ProfileFilter } from '../../application/profiles/profile-filter'
import { checkErrorLabel, proxyStringErrorLabel } from '../labels'
import ProxyLineImportPanel from './ProxyLineImportPanel.vue'
import IconButton from '../components/IconButton.vue'
import Modal from '../components/Modal.vue'
import Tabs from '../components/Tabs.vue'
import PasswordInput from '../components/PasswordInput.vue'
import OverflowMenu from '../components/OverflowMenu.vue'
import HelpTip from '../components/HelpTip.vue'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
  status: [message: string, error?: boolean]
  refresh: []
}>()

const importOpen = shallowRef(false)
const profileTabs = [
  { icon: Cable, id: 'connection', label: t('tabConnection') },
  { icon: Settings2, id: 'advanced', label: t('editorAdvanced') },
] as const
const PROFILE_COLORS = [
  '#3A52E0',
  '#178A5C',
  '#C42F48',
  '#B7791F',
  '#7A5AF8',
  '#0E7490',
  '#DB2777',
  '#475569',
] as const

const onImported = (): void => {
  importOpen.value = false
  emit('refresh')
}
const filter = reactive<ProfileFilter>({ check: 'ALL', query: '', transport: 'ALL' })
const selectedIds = shallowRef<ReadonlySet<string>>(new Set())
const bulkCurrentId = shallowRef<string | null>(null)
const isChecking = (profile: ProxyProfile): boolean =>
  (checkingId.value === profile.id && props.busy) || bulkCurrentId.value === profile.id
const bulkProgress = shallowRef<{ readonly done: number; readonly total: number } | null>(null)
let stopRequested = false

const shownProfiles = computed(() => filterProfiles(props.state.config.profiles, filter))
const selectedProfiles = computed(() =>
  props.state.config.profiles.filter((profile) => selectedIds.value.has(profile.id)),
)

watch(
  () => props.state.config.profiles,
  (profiles) => {
    const existing = new Set<string>(profiles.map((profile) => profile.id))
    selectedIds.value = new Set([...selectedIds.value].filter((id) => existing.has(id)))
  },
)

const toggleSelected = (profileId: string, selected: boolean): void => {
  const next = new Set(selectedIds.value)
  if (selected) next.add(profileId)
  else next.delete(profileId)
  selectedIds.value = next
}

const selectAllShown = (): void => {
  selectedIds.value = new Set([
    ...selectedIds.value,
    ...shownProfiles.value.map((profile) => profile.id),
  ])
}

const deleteSelected = async (): Promise<void> => {
  const ids = new Set(selectedProfiles.value.map((profile) => profile.id))
  const affectedRules = props.state.config.rules.filter(
    (rule) =>
      rule.action.targetProxyProfileId !== null && ids.has(rule.action.targetProxyProfileId),
  ).length
  const activeId = props.state.config.general.activeProxyProfileId
  const details = [
    activeId !== null && ids.has(activeId) ? t('deleteProfileImpactGlobal') : '',
    affectedRules > 0 ? t('deleteProfileImpactRules', String(affectedRules)) : '',
  ].filter(Boolean)
  const confirmed = await confirmController.destructive(
    {
      confirmLabel: t('delete'),
      details,
      message: t('deleteProfilesMessage'),
      title: t('deleteProfilesTitle', String(ids.size)),
    },
    props.state.config.general.confirmDangerousActions,
  )
  if (confirmed) emit('command', { profileIds: [...ids], type: 'DELETE_PROFILES' })
}

const checkSelected = async (): Promise<void> => {
  const profiles = selectedProfiles.value
  const confirmed = await confirmController.request({
    confirmLabel: t('runCheck'),
    details: [t('manualCheckDisclosure')],
    message: t('bulkCheckMessage', String(profiles.length)),
    title: t('manualCheckTitle'),
  })
  if (!confirmed) return
  stopRequested = false
  for (const [index, profile] of profiles.entries()) {
    if (stopRequested) break
    bulkProgress.value = { done: index + 1, total: profiles.length }
    bulkCurrentId.value = profile.id
    await runtimeClient.command({ profileId: profile.id, type: 'CHECK_PROFILE' })
  }
  bulkCurrentId.value = null
  bulkProgress.value = null
  emit('refresh')
}

const stopChecks = (): void => {
  stopRequested = true
  void runtimeClient.command({ type: 'CANCEL_PROXY_CHECK' })
}
const pasteText = shallowRef('')
const pasteError = shallowRef('')
const pasteChoices = shallowRef<readonly [ParsedProxyString, ParsedProxyString] | null>(null)
const pasteChoice = shallowRef<0 | 1>(0)

interface EndpointDraft {
  transport: ProxyTransport
  host: string
  port: number
  username: string
  password: string
}

interface ProfileDraft {
  name: string
  shortName: string | null
  color: string
  note: string
  checkUrl: string
  useSameProxy: boolean
  httpEndpoint: EndpointDraft
  httpsEndpoint: EndpointDraft
}

const blankEndpoint = (transport: ProxyTransport): EndpointDraft => ({
  host: '',
  password: '',
  port: transport === 'HTTPS' ? 443 : 8080,
  transport,
  username: '',
})

const blankProfile = (): ProfileDraft => ({
  checkUrl: props.state.config.general.ipGeoProviderEndpoint,
  color: '#405CF5',
  httpEndpoint: blankEndpoint('HTTP'),
  httpsEndpoint: blankEndpoint('HTTP'),
  name: '',
  note: '',
  shortName: null,
  useSameProxy: true,
})

const copyEndpoint = (endpoint: ProxyEndpoint): EndpointDraft => ({
  ...endpoint,
})

const copyProfile = (profile: ProxyProfile): ProfileDraft => ({
  checkUrl: profile.checkUrl,
  color: profile.color,
  httpEndpoint: copyEndpoint(profile.httpEndpoint),
  httpsEndpoint: copyEndpoint(profile.httpsEndpoint),
  name: profile.name,
  note: profile.note,
  shortName: profile.shortName,
  useSameProxy: profile.useSameProxy,
})

const editingId = shallowRef<string | null>(null)
const formOpen = shallowRef(false)
const draft = reactive<ProfileDraft>(blankProfile())
const checkingId = shallowRef<string | null>(null)
const editorNameInput = shallowRef<HTMLInputElement | null>(null)
let editorActivator: HTMLElement | null = null
const restoreEditorFocus = shallowRef(false)

const replaceDraft = (next: ProfileDraft): void => {
  Object.assign(draft, next)
  Object.assign(draft.httpEndpoint, next.httpEndpoint)
  Object.assign(draft.httpsEndpoint, next.httpsEndpoint)
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

const applyParsed = (proxy: ParsedProxyString): void => {
  const endpoint: EndpointDraft = {
    host: proxy.host,
    password: proxy.password ?? '',
    port: proxy.port,
    transport: proxy.transport ?? draft.httpEndpoint.transport,
    username: proxy.username ?? '',
  }
  draft.useSameProxy = true
  draft.httpEndpoint = { ...endpoint }
  draft.httpsEndpoint = { ...endpoint }
  if (draft.name.trim() === '') draft.name = `${proxy.host}:${proxy.port}`
  pasteText.value = ''
  pasteChoices.value = null
}

const fillFromString = (): void => {
  pasteError.value = ''
  pasteChoices.value = null
  const parsed = parseProxyString(pasteText.value)
  if (parsed.kind === 'FAILURE') {
    pasteError.value = proxyStringErrorLabel(parsed.code)
    return
  }
  if (parsed.kind === 'AMBIGUOUS') {
    pasteChoice.value = 0
    pasteChoices.value = [parsed.hostFirst, parsed.credentialsFirst]
    return
  }
  applyParsed(parsed.proxy)
}

const readingLabel = (proxy: ParsedProxyString): string =>
  [proxy.transport, `${proxy.host}:${proxy.port}`, proxy.username].filter(Boolean).join(' ')

const resetPaste = (): void => {
  pasteText.value = ''
  pasteError.value = ''
  pasteChoices.value = null
}

const create = (event: MouseEvent): void => {
  resetPaste()
  editorActivator = event.currentTarget as HTMLElement
  editingId.value = null
  replaceDraft(blankProfile())
  formOpen.value = true
  void nextTick(() => editorNameInput.value?.focus())
}

const edit = (profile: ProxyProfile, event: MouseEvent): void => {
  resetPaste()
  const source = event.currentTarget as HTMLElement
  // A menu item disappears when the menu closes; focus returns to the menu button instead.
  editorActivator =
    source.closest('.overflow-menu')?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? source
  editingId.value = profile.id
  replaceDraft(copyProfile(profile))
  formOpen.value = true
  void nextTick(() => editorNameInput.value?.focus())
}

const save = (): void => {
  const httpEndpoint: ProxyEndpoint = { ...draft.httpEndpoint }
  const httpsEndpoint: ProxyEndpoint = draft.useSameProxy
    ? { ...draft.httpEndpoint }
    : { ...draft.httpsEndpoint }
  emit('command', {
    input: {
      checkUrl: draft.checkUrl,
      color: draft.color,
      httpEndpoint,
      httpsEndpoint,
      name: draft.name,
      note: draft.note,
      shortName:
        draft.shortName === null || draft.shortName.trim() === ''
          ? null
          : draft.shortName.trim().toUpperCase(),
      useSameProxy: draft.useSameProxy,
    },
    profileId: editingId.value,
    type: 'SAVE_PROFILE',
  })
  closeEditor()
}

const remove = async (profile: ProxyProfile): Promise<void> => {
  const usedBy = props.state.config.rules.filter(
    (rule) => rule.action.targetProxyProfileId === profile.id,
  ).length
  const details = [
    props.state.config.general.activeProxyProfileId === profile.id
      ? t('deleteProfileImpactGlobal')
      : '',
    usedBy > 0 ? t('deleteProfileImpactRules', String(usedBy)) : '',
  ].filter(Boolean)
  const confirmed = await confirmController.destructive(
    {
      confirmLabel: t('delete'),
      details,
      message: t('deleteProfileMessage', profile.name),
      title: t('deleteProfileTitle'),
    },
    props.state.config.general.confirmDangerousActions,
  )
  if (confirmed) {
    emit('command', {
      confirmed: true,
      profileId: profile.id,
      type: 'DELETE_PROFILE',
    })
  }
}

const check = async (profile: ProxyProfile): Promise<void> => {
  const confirmed = await confirmController.request({
    confirmLabel: t('runCheck'),
    details: [t('manualCheckDisclosure')],
    message: t('manualCheckMessage', [profile.checkUrl, profile.name]),
    title: t('manualCheckTitle'),
  })
  if (!confirmed) return
  checkingId.value = profile.id
  emit('command', { profileId: profile.id, type: 'CHECK_PROFILE' })
}

const hasCredentials = (profile: ProxyProfile): boolean =>
  [profile.httpEndpoint, ...(profile.useSameProxy ? [] : [profile.httpsEndpoint])].some(
    (endpoint) => endpoint.username !== '' || endpoint.password !== '',
  )

const copy = async (text: string, withPassword: boolean): Promise<void> => {
  if (await copyText(text)) {
    emit('status', withPassword ? t('copiedWithPassword') : t('copied'))
  } else {
    emit('status', t('copyFailed'), true)
  }
}

const copyProfileText = (profile: ProxyProfile, format: ProxyTextFormat): Promise<void> =>
  copy(formatProfile(profile, format), hasCredentials(profile))

const copyAll = (): Promise<void> =>
  copy(
    formatProxyList(props.state.config.profiles, 'URL'),
    props.state.config.profiles.some(hasCredentials),
  )

const endpointRows = (profile: ProxyProfile) =>
  profile.useSameProxy
    ? [{ endpoint: profile.httpEndpoint, label: t('allSchemes') }]
    : [
        { endpoint: profile.httpEndpoint, label: t('httpWs') },
        { endpoint: profile.httpsEndpoint, label: t('httpsWss') },
      ]

const ruleUsage = (profile: ProxyProfile): number =>
  props.state.config.rules.filter((rule) => rule.action.targetProxyProfileId === profile.id).length

const checkSummary = (check: ProxyCheckResult): string =>
  [
    check.availability ? t('available') : t('unavailable'),
    `${Math.round(check.totalDurationMs)} ${t('millisecondsShort')}`,
    check.externalIp ?? (check.errorCode === null ? '' : checkErrorLabel(check.errorCode)),
    check.country ?? '',
  ]
    .filter(Boolean)
    .join(' · ')

const cancelCheck = (): void => {
  checkingId.value = null
  emit('command', { type: 'CANCEL_PROXY_CHECK' })
}

watch(() => props.busy, restoreFocus)
</script>

<template>
  <div class="stack">
    <div class="section-heading">
      <div>
        <h2>{{ t('proxyProfiles') }}</h2>
        <p>{{ t('proxyProfilesDescription') }}</p>
      </div>
      <div class="button-row">
        <button type="button" @click="importOpen = true">
          <Upload :size="16" aria-hidden="true" />
          {{ t('importFromText') }}
        </button>
        <button
          type="button"
          :disabled="state.config.profiles.length === 0"
          @click="void copyAll()"
        >
          <Copy :size="16" aria-hidden="true" />
          {{ t('copyAllAsUrls') }}
        </button>
        <button class="primary" type="button" :disabled="busy" @click="create($event)">
          <Plus :size="16" aria-hidden="true" />
          {{ t('addProfile') }}
        </button>
      </div>
    </div>

    <Modal :open="importOpen" :title="t('importFromText')" size="large" @close="importOpen = false">
      <ProxyLineImportPanel
        embedded
        :state="state"
        :busy="busy"
        @status="(message, error) => emit('status', message, error)"
        @refresh="onImported"
      />
    </Modal>

    <div v-if="state.config.profiles.length === 0" class="surface empty-state">
      <Server :size="28" aria-hidden="true" />
      <strong>{{ t('noProxyProfiles') }}</strong>
      <p>{{ t('noProxyProfilesDescription') }}</p>
    </div>

    <template v-else>
      <div class="list-toolbar">
        <label class="search-field">
          <span class="sr-only">{{ t('searchProfiles') }}</span>
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="filter.query"
            type="search"
            autocomplete="off"
            :placeholder="t('searchProfiles')"
            :aria-label="t('searchProfiles')"
          />
        </label>
        <select
          v-model="filter.transport"
          name="profile-transport-filter"
          :aria-label="t('transport')"
        >
          <option value="ALL">
            {{ t('allProtocols') }}
          </option>
          <option value="HTTP">
            {{ t('proxyInfoHttp') }}
          </option>
          <option value="HTTPS">
            {{ t('proxyInfoHttps') }}
          </option>
        </select>
        <select
          v-model="filter.check"
          name="profile-check-filter"
          :aria-label="t('filterLastCheck')"
        >
          <option value="ALL">
            {{ t('anyCheckResult') }}
          </option>
          <option value="AVAILABLE">
            {{ t('available') }}
          </option>
          <option value="UNAVAILABLE">
            {{ t('unavailable') }}
          </option>
          <option value="NEVER">
            {{ t('neverChecked') }}
          </option>
        </select>
        <span class="muted toolbar-count" aria-live="polite">
          {{
            t('showingCount', [String(shownProfiles.length), String(state.config.profiles.length)])
          }}
        </span>
      </div>

      <div class="selection-bar" :class="{ active: selectedIds.size > 0 }">
        <button
          type="button"
          class="ghost small"
          :disabled="shownProfiles.length === 0"
          @click="selectAllShown"
        >
          <ListChecks :size="16" aria-hidden="true" />
          {{ t('selectAllShown') }}
        </button>
        <template v-if="selectedIds.size > 0">
          <button type="button" class="ghost small" @click="selectedIds = new Set()">
            {{ t('clearSelection') }}
          </button>
          <span class="selection-actions">
            <button
              type="button"
              class="small"
              :disabled="busy || bulkProgress !== null"
              @click="void checkSelected()"
            >
              <Activity :size="16" aria-hidden="true" />
              {{ t('checkSelected', String(selectedIds.size)) }}
            </button>
            <button
              class="small danger-text"
              type="button"
              :disabled="busy || bulkProgress !== null"
              @click="void deleteSelected()"
            >
              <Trash2 :size="16" aria-hidden="true" />
              {{ t('deleteSelected', String(selectedIds.size)) }}
            </button>
          </span>
        </template>
      </div>
      <p v-if="bulkProgress" class="notice" role="status">
        <LoaderCircle :size="16" aria-hidden="true" class="spin" />
        {{ t('checkingProgress', [String(bulkProgress.done), String(bulkProgress.total)]) }}
        <button type="button" class="small" @click="stopChecks">
          {{ t('stopChecks') }}
        </button>
      </p>

      <div v-if="shownProfiles.length === 0" class="surface empty-state">
        <p>{{ t('noMatchingProfiles') }}</p>
      </div>

      <ul v-else class="proxy-list" :aria-label="t('proxyProfiles')">
        <li v-for="profile in shownProfiles" :key="profile.id" class="proxy-row">
          <input
            type="checkbox"
            name="profile-select"
            :checked="selectedIds.has(profile.id)"
            :aria-label="t('selectProfileNamed', profile.name)"
            @change="toggleSelected(profile.id, ($event.target as HTMLInputElement).checked)"
          />
          <div class="proxy-identity">
            <span
              class="color-dot"
              :style="{ backgroundColor: profile.color }"
              aria-hidden="true"
            />
            <div class="proxy-name">
              <div class="proxy-title">
                <h3 class="truncate" :title="profile.name">
                  {{ profile.name }}
                </h3>
                <span class="badge neutral">{{
                  profile.shortName ?? profile.generatedShortName
                }}</span>
                <span
                  v-if="state.config.general.activeProxyProfileId === profile.id"
                  class="global-marker"
                  role="img"
                  :aria-label="t('globalProxyMarker')"
                  :title="t('globalProxyMarker')"
                >
                  <Globe :size="14" aria-hidden="true" />
                </span>
              </div>
              <small>
                {{
                  ruleUsage(profile) === 0
                    ? t('notUsedByRules')
                    : t('usedByRules', String(ruleUsage(profile)))
                }}
              </small>
            </div>
          </div>
          <div class="proxy-endpoint">
            <div v-for="row in endpointRows(profile)" :key="row.label" class="endpoint-line">
              <span class="badge neutral protocol">{{ row.endpoint.transport }}</span>
              <code class="truncate" :title="`${row.endpoint.host}:${row.endpoint.port}`"
                >{{ row.endpoint.host }}:{{ row.endpoint.port }}</code
              >
            </div>
          </div>
          <div class="proxy-user">
            <template v-if="profile.httpEndpoint.username">
              <User :size="14" aria-hidden="true" />
              <span class="truncate" :title="profile.httpEndpoint.username">{{
                profile.httpEndpoint.username
              }}</span>
            </template>
            <span v-else class="muted">{{ t('noAuth') }}</span>
          </div>
          <div class="proxy-status">
            <span v-if="isChecking(profile)" class="badge checking" role="status">
              <LoaderCircle :size="12" aria-hidden="true" class="spin" />
              {{ t('checkingNow') }}
            </span>
            <span
              v-else-if="profile.lastCheck"
              class="badge"
              :class="profile.lastCheck.availability ? 'success' : 'danger'"
              :title="checkSummary(profile.lastCheck)"
            >
              <CircleCheck v-if="profile.lastCheck.availability" :size="12" aria-hidden="true" />
              <CircleX v-else :size="12" aria-hidden="true" />
              <span class="truncate">{{ checkSummary(profile.lastCheck) }}</span>
            </span>
            <span v-else class="muted">{{ t('neverChecked') }}</span>
          </div>
          <div class="row-actions">
            <IconButton
              :icon="Pencil"
              :label="t('editProfileNamed', profile.name)"
              :disabled="busy"
              @click="edit(profile, $event)"
            />
            <IconButton
              v-if="state.config.general.activeProxyProfileId !== profile.id"
              :icon="Globe"
              :label="t('useProfileGloballyNamed', profile.name)"
              :disabled="busy"
              @click="emit('command', { profileId: profile.id, type: 'USE_PROFILE' })"
            />
            <IconButton
              v-if="checkingId === profile.id && busy"
              :icon="CircleStop"
              :label="t('cancelCheck')"
              @click="cancelCheck"
            />
            <IconButton
              v-else
              :icon="Activity"
              :label="t('checkProfileNamed', profile.name)"
              :disabled="busy"
              @click="void check(profile)"
            />
            <OverflowMenu :label="t('moreActionsFor', profile.name)">
              <button
                role="menuitem"
                type="button"
                :disabled="busy"
                @click="emit('command', { profileId: profile.id, type: 'DUPLICATE_PROFILE' })"
              >
                <CopyPlus :size="16" aria-hidden="true" />
                {{ t('duplicate') }}
              </button>
              <button role="menuitem" type="button" @click="void copyProfileText(profile, 'URL')">
                <Link :size="16" aria-hidden="true" />
                {{ t('copyUrl') }}
              </button>
              <button role="menuitem" type="button" @click="void copyProfileText(profile, 'CURL')">
                <Terminal :size="16" aria-hidden="true" />
                {{ t('copyCurl') }}
              </button>
              <button
                role="menuitem"
                type="button"
                @click="void copyProfileText(profile, 'COMPACT')"
              >
                <Copy :size="16" aria-hidden="true" />
                {{ t('copyCompact') }}
              </button>
              <button
                role="menuitem"
                class="danger-text"
                type="button"
                :disabled="busy"
                @click="void remove(profile)"
              >
                <Trash2 :size="16" aria-hidden="true" />
                {{ t('delete') }}
              </button>
            </OverflowMenu>
          </div>
        </li>
      </ul>
    </template>

    <p class="notice">
      <ShieldAlert :size="16" aria-hidden="true" />
      {{ t('credentialsStorageNotice') }}
    </p>

    <Modal
      :open="formOpen"
      :title="editingId === null ? t('addProxyProfile') : t('editProxyProfile')"
      fixed-height
      @close="closeEditor"
    >
      <form id="profile-form" @submit.prevent="save">
        <Tabs :label="t('profileEditorTabs')" :tabs="profileTabs">
          <template #connection>
            <div class="editor">
              <section class="paste-box">
                <div class="field">
                  <span class="field-label">
                    <label for="proxy-string">{{ t('pasteProxyString') }}</label>
                    <HelpTip :text="t('tipPasteString')" article="import" />
                  </span>
                  <span class="paste-row">
                    <input
                      id="proxy-string"
                      v-model="pasteText"
                      name="proxy-string"
                      autocomplete="off"
                      spellcheck="false"
                      :placeholder="t('pasteProxyStringPlaceholder')"
                      :aria-describedby="'proxy-string-help'"
                      @keydown.enter.prevent="fillFromString"
                    />
                    <button type="button" @click="fillFromString">
                      <ClipboardPaste :size="16" aria-hidden="true" />
                      {{ t('fillFromString') }}
                    </button>
                  </span>
                </div>
                <small id="proxy-string-help">{{ t('pasteProxyStringDescription') }}</small>
                <p v-if="pasteError" class="notice danger" role="alert">
                  {{ pasteError }}
                </p>
                <fieldset v-if="pasteChoices" class="paste-choices">
                  <legend>{{ t('chooseReading') }}</legend>
                  <label
                    v-for="(choice, index) in pasteChoices"
                    :key="index"
                    class="check-row compact"
                  >
                    <input v-model="pasteChoice" type="radio" name="paste-order" :value="index" />
                    <span>
                      <code>{{ readingLabel(choice) }}</code>
                    </span>
                  </label>
                  <button
                    type="button"
                    class="small"
                    @click="applyParsed(pasteChoices[pasteChoice])"
                  >
                    {{ t('useReading') }}
                  </button>
                </fieldset>
              </section>

              <section class="editor-section">
                <h3>{{ t('editorGeneral') }}</h3>
                <div class="name-grid">
                  <label>
                    {{ t('name') }}
                    <input ref="editorNameInput" v-model="draft.name" required maxlength="256" />
                  </label>
                  <label>
                    {{ t('shortNameLabel') }}
                    <input
                      v-model="draft.shortName"
                      pattern="[A-Za-z0-9]{1,3}"
                      maxlength="3"
                      :placeholder="t('shortNamePlaceholder')"
                    />
                  </label>
                </div>
                <div class="color-field" role="group" :aria-label="t('color')">
                  <span class="field-label">{{ t('color') }}</span>
                  <div class="swatches">
                    <button
                      v-for="color in PROFILE_COLORS"
                      :key="color"
                      type="button"
                      class="swatch"
                      :style="{ backgroundColor: color }"
                      :aria-label="t('colorSwatch', color)"
                      :aria-pressed="draft.color.toUpperCase() === color ? 'true' : 'false'"
                      @click="draft.color = color"
                    />
                    <label class="swatch custom" :title="t('customColor')">
                      <span class="sr-only">{{ t('customColor') }}</span>
                      <input v-model="draft.color" type="color" />
                    </label>
                  </div>
                </div>
              </section>

              <section class="editor-section">
                <div class="section-title-row">
                  <h3>{{ t('editorEndpoint') }}</h3>
                  <span class="switch-with-tip">
                    <label class="switch">
                      <input v-model="draft.useSameProxy" type="checkbox" role="switch" />
                      {{ t('useHttpForAllShort') }}
                    </label>
                    <HelpTip :text="t('tipOneEndpoint')" article="proxies" />
                  </span>
                </div>
                <fieldset class="endpoint-block">
                  <legend>{{ draft.useSameProxy ? t('allSchemes') : t('httpWsEndpoint') }}</legend>
                  <div class="endpoint-row">
                    <label>
                      {{ t('transport') }}
                      <select v-model="draft.httpEndpoint.transport">
                        <option value="HTTP">{{ t('proxyInfoHttp') }}</option>
                        <option value="HTTPS">{{ t('proxyInfoHttps') }}</option>
                      </select>
                    </label>
                    <label>
                      {{ t('host') }}
                      <input v-model="draft.httpEndpoint.host" required autocomplete="off" />
                    </label>
                    <label>
                      {{ t('port') }}
                      <input
                        v-model.number="draft.httpEndpoint.port"
                        type="number"
                        min="1"
                        max="65535"
                        required
                      />
                    </label>
                  </div>
                  <div class="auth-row">
                    <label>
                      {{ t('username') }}
                      <input
                        v-model="draft.httpEndpoint.username"
                        autocomplete="off"
                        spellcheck="false"
                      />
                    </label>
                    <PasswordInput v-model="draft.httpEndpoint.password" :label="t('password')" />
                  </div>
                </fieldset>
                <fieldset v-if="!draft.useSameProxy" class="endpoint-block">
                  <legend>{{ t('httpsWssEndpoint') }}</legend>
                  <div class="endpoint-row">
                    <label>
                      {{ t('transport') }}
                      <select v-model="draft.httpsEndpoint.transport">
                        <option value="HTTP">{{ t('proxyInfoHttp') }}</option>
                        <option value="HTTPS">{{ t('proxyInfoHttps') }}</option>
                      </select>
                    </label>
                    <label>
                      {{ t('host') }}
                      <input v-model="draft.httpsEndpoint.host" required autocomplete="off" />
                    </label>
                    <label>
                      {{ t('port') }}
                      <input
                        v-model.number="draft.httpsEndpoint.port"
                        type="number"
                        min="1"
                        max="65535"
                        required
                      />
                    </label>
                  </div>
                  <div class="auth-row">
                    <label>
                      {{ t('username') }}
                      <input
                        v-model="draft.httpsEndpoint.username"
                        autocomplete="off"
                        spellcheck="false"
                      />
                    </label>
                    <PasswordInput v-model="draft.httpsEndpoint.password" :label="t('password')" />
                  </div>
                </fieldset>
                <small v-if="draft.useSameProxy">
                  {{ t('useHttpForAllDescription') }}
                </small>
              </section>
            </div>
          </template>
          <template #advanced>
            <div class="stack">
              <label>
                {{ t('checkUrl') }}
                <input v-model="draft.checkUrl" type="url" required />
              </label>
              <label>
                {{ t('note') }}
                <textarea v-model="draft.note" rows="3" maxlength="4096" />
              </label>
            </div>
          </template>
        </Tabs>
      </form>
      <template #footer>
        <button type="button" @click="closeEditor">
          {{ t('cancel') }}
        </button>
        <button class="primary" type="submit" form="profile-form" :disabled="busy">
          {{ t('saveProfile') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.proxy-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  list-style: none;
}

.proxy-row {
  display: grid;
  grid-template-columns:
    auto minmax(150px, 1.3fr) minmax(170px, 1.6fr) minmax(90px, 1fr)
    minmax(110px, 1.1fr) auto;
  gap: var(--space-4);
  align-items: center;
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.proxy-row:last-child {
  border-bottom: 0;
}

.proxy-row:hover {
  background: var(--color-surface-2);
}

.proxy-identity {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.proxy-name {
  display: grid;
  min-width: 0;
}

.proxy-title {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.proxy-title h3 {
  font-size: 14px;
}

.proxy-endpoint {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.endpoint-line {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.protocol {
  min-width: 48px;
  justify-content: center;
}

.proxy-user,
.proxy-status {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  color: var(--color-muted);
  font-size: 13px;
}

.proxy-status .badge {
  max-width: 100%;
}

.badge.checking {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.global-marker {
  display: inline-grid;
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  place-items: center;
}

.row-actions {
  justify-content: flex-end;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}

/* Editor */
.editor {
  display: grid;
  gap: var(--space-5);
}

.paste-box {
  display: grid;
  gap: 6px;
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius);
  background: var(--color-surface-2);
}

.paste-row {
  display: flex;
  gap: var(--space-2);
}

.paste-row input {
  flex: 1;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 400;
}

.paste-choices {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.editor-section {
  display: grid;
  gap: var(--space-3);
}

.switch-with-tip {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.section-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
}

.name-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px;
  gap: var(--space-3);
}

.color-field {
  display: grid;
  gap: 6px;
}

.field-label {
  color: var(--color-muted);
  font-size: 12.5px;
  font-weight: 550;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.swatch {
  width: 26px;
  min-height: 26px;
  height: 26px;
  padding: 0;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--color-border);
}

.swatch[aria-pressed='true'] {
  box-shadow: 0 0 0 2px var(--color-text);
}

.swatch.custom {
  display: grid;
  overflow: hidden;
  place-items: center;
  background: conic-gradient(#e5484d, #f5a524, #30a46c, #0091ff, #8e4ec6, #e5484d);
}

.swatch.custom input {
  width: 40px;
  height: 40px;
  min-height: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  cursor: pointer;
}

.endpoint-block {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3) var(--space-4) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.endpoint-block legend {
  padding: 0 6px;
  color: var(--color-muted);
  font-size: 12.5px;
  font-weight: 600;
}

.endpoint-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) 96px;
  gap: var(--space-3);
}

.auth-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-3);
}

.advanced summary {
  color: var(--color-muted);
  font-weight: 600;
  cursor: pointer;
}

.advanced[open] summary {
  margin-bottom: var(--space-2);
}

@media (max-width: 900px) {
  .proxy-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .proxy-endpoint,
  .proxy-user,
  .proxy-status {
    grid-column: 2 / 3;
  }
}

@media (max-width: 560px) {
  .endpoint-row,
  .auth-row,
  .name-grid {
    grid-template-columns: 1fr;
  }
}
</style>
