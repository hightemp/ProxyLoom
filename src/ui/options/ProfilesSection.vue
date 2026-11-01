<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, watch } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type { ProxyEndpoint, ProxyProfile, ProxyTransport } from '../../domain/types/entities'
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
const filter = reactive<ProfileFilter>({ check: 'ALL', query: '', transport: 'ALL' })
const selectedIds = shallowRef<ReadonlySet<string>>(new Set())
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
    await runtimeClient.command({ profileId: profile.id, type: 'CHECK_PROFILE' })
  }
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
const revealPasswords = shallowRef(false)
const draft = reactive<ProfileDraft>(blankProfile())
const checkingId = shallowRef<string | null>(null)
const editorNameInput = shallowRef<HTMLInputElement | null>(null)
let editorActivator: HTMLElement | null = null
const restoreEditorFocus = shallowRef(false)

const effectiveHttps = computed(() =>
  draft.useSameProxy ? draft.httpEndpoint : draft.httpsEndpoint,
)

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
  editorActivator = event.currentTarget as HTMLElement
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
        <button
          type="button"
          :disabled="state.config.profiles.length === 0"
          @click="void copyAll()"
        >
          {{ t('copyAllAsUrls') }}
        </button>
        <button type="button" :aria-expanded="importOpen" @click="importOpen = !importOpen">
          {{ t('importFromText') }}
        </button>
        <button class="primary" type="button" :disabled="busy" @click="create($event)">
          {{ t('addProfile') }}
        </button>
      </div>
    </div>

    <ProxyLineImportPanel
      v-if="importOpen"
      :state="state"
      :busy="busy"
      @status="(message, error) => emit('status', message, error)"
      @refresh="emit('refresh')"
    />

    <p class="notice">
      {{ t('credentialsStorageNotice') }}
    </p>

    <div v-if="state.config.profiles.length === 0" class="surface empty-state">
      <strong>{{ t('noProxyProfiles') }}</strong>
      <p>{{ t('noProxyProfilesDescription') }}</p>
    </div>

    <div v-else class="surface card stack profile-toolbar">
      <div class="filter-grid">
        <label>
          {{ t('searchProfiles') }}
          <input v-model="filter.query" type="search" autocomplete="off" />
        </label>
        <label>
          {{ t('transport') }}
          <select v-model="filter.transport" name="profile-transport-filter">
            <option value="ALL">{{ t('all') }}</option>
            <option value="HTTP">{{ t('proxyInfoHttp') }}</option>
            <option value="HTTPS">{{ t('proxyInfoHttps') }}</option>
          </select>
        </label>
        <label>
          {{ t('filterLastCheck') }}
          <select v-model="filter.check" name="profile-check-filter">
            <option value="ALL">{{ t('all') }}</option>
            <option value="AVAILABLE">{{ t('available') }}</option>
            <option value="UNAVAILABLE">{{ t('unavailable') }}</option>
            <option value="NEVER">{{ t('neverChecked') }}</option>
          </select>
        </label>
      </div>
      <div class="button-row">
        <span aria-live="polite">
          {{
            t('showingCount', [String(shownProfiles.length), String(state.config.profiles.length)])
          }}
        </span>
        <button type="button" :disabled="shownProfiles.length === 0" @click="selectAllShown">
          {{ t('selectAllShown') }}
        </button>
        <template v-if="selectedIds.size > 0">
          <button type="button" @click="selectedIds = new Set()">
            {{ t('clearSelection') }}
          </button>
          <button
            type="button"
            :disabled="busy || bulkProgress !== null"
            @click="void checkSelected()"
          >
            {{ t('checkSelected', String(selectedIds.size)) }}
          </button>
          <button
            class="danger-text"
            type="button"
            :disabled="busy || bulkProgress !== null"
            @click="void deleteSelected()"
          >
            {{ t('deleteSelected', String(selectedIds.size)) }}
          </button>
        </template>
      </div>
      <p v-if="bulkProgress" class="notice" role="status">
        {{ t('checkingProgress', [String(bulkProgress.done), String(bulkProgress.total)]) }}
        <button type="button" @click="stopChecks">
          {{ t('stopChecks') }}
        </button>
      </p>
    </div>

    <div
      v-if="state.config.profiles.length > 0 && shownProfiles.length === 0"
      class="surface empty-state"
    >
      <p>{{ t('noMatchingProfiles') }}</p>
    </div>

    <div v-if="shownProfiles.length > 0" class="card-grid">
      <article v-for="profile in shownProfiles" :key="profile.id" class="surface card profile-card">
        <div class="profile-title">
          <input
            type="checkbox"
            name="profile-select"
            :checked="selectedIds.has(profile.id)"
            :aria-label="t('selectProfileNamed', profile.name)"
            @change="toggleSelected(profile.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="color-dot" :style="{ backgroundColor: profile.color }" aria-hidden="true" />
          <div>
            <h3>{{ profile.name }}</h3>
            <small>{{ profile.shortName ?? profile.generatedShortName }}</small>
          </div>
          <span v-if="state.config.general.activeProxyProfileId === profile.id" class="status-pill">
            {{ t('global') }}
          </span>
        </div>
        <dl class="compact-dl">
          <div>
            <dt>{{ t('httpWs') }}</dt>
            <dd>
              {{ profile.httpEndpoint.transport }} {{ profile.httpEndpoint.host }}:{{
                profile.httpEndpoint.port
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('httpsWss') }}</dt>
            <dd>
              {{ profile.httpsEndpoint.transport }} {{ profile.httpsEndpoint.host }}:{{
                profile.httpsEndpoint.port
              }}
            </dd>
          </div>
        </dl>
        <p v-if="profile.note">
          {{ profile.note }}
        </p>
        <div
          v-if="profile.lastCheck"
          class="check-result"
          :class="{ success: profile.lastCheck.availability }"
        >
          <strong>
            {{ profile.lastCheck.availability ? t('available') : t('unavailable') }}
          </strong>
          <span>
            {{ Math.round(profile.lastCheck.totalDurationMs) }} {{ t('millisecondsShort') }} ·
            {{
              profile.lastCheck.externalIp ??
              (profile.lastCheck.errorCode === null
                ? t('noIp')
                : checkErrorLabel(profile.lastCheck.errorCode))
            }}
          </span>
          <small>
            {{ t('connectDuration') }}
            {{
              profile.lastCheck.connectDurationMs === null
                ? t('notAvailable')
                : `${Math.round(profile.lastCheck.connectDurationMs)} ${t('millisecondsShort')}`
            }}
          </small>
        </div>
        <div class="button-row">
          <button type="button" :disabled="busy" @click="edit(profile, $event)">
            {{ t('edit') }}
          </button>
          <button
            type="button"
            :disabled="busy"
            @click="
              emit('command', {
                profileId: profile.id,
                type: 'DUPLICATE_PROFILE',
              })
            "
          >
            {{ t('duplicate') }}
          </button>
          <button
            type="button"
            :disabled="busy && checkingId !== profile.id"
            @click="checkingId === profile.id && busy ? cancelCheck() : void check(profile)"
          >
            {{ checkingId === profile.id && busy ? t('cancelCheck') : t('check') }}
          </button>
          <details class="copy-menu">
            <summary>{{ t('copyAs') }}</summary>
            <div class="button-row" role="group" :aria-label="t('copyProfileAs', profile.name)">
              <button type="button" @click="void copyProfileText(profile, 'URL')">
                {{ t('copyAsUrl') }}
              </button>
              <button type="button" @click="void copyProfileText(profile, 'CURL')">
                {{ t('copyAsCurl') }}
              </button>
              <button type="button" @click="void copyProfileText(profile, 'COMPACT')">
                {{ t('copyAsCompact') }}
              </button>
            </div>
          </details>
          <button class="danger-text" type="button" :disabled="busy" @click="void remove(profile)">
            {{ t('delete') }}
          </button>
        </div>
      </article>
    </div>

    <form v-if="formOpen" class="surface card stack editor" @submit.prevent="save">
      <div class="section-heading">
        <h3>{{ editingId === null ? t('addProxyProfile') : t('editProxyProfile') }}</h3>
        <button type="button" @click="closeEditor">
          {{ t('close') }}
        </button>
      </div>
      <div class="paste-row">
        <label>
          {{ t('pasteProxyString') }}
          <input
            v-model="pasteText"
            name="proxy-string"
            autocomplete="off"
            spellcheck="false"
            :aria-describedby="'proxy-string-help'"
            @keydown.enter.prevent="fillFromString"
          />
        </label>
        <button type="button" @click="fillFromString">
          {{ t('fillFromString') }}
        </button>
      </div>
      <small id="proxy-string-help" class="muted">{{ t('pasteProxyStringDescription') }}</small>
      <p v-if="pasteError" class="notice danger" role="alert">
        {{ pasteError }}
      </p>
      <fieldset v-if="pasteChoices" class="paste-choices">
        <legend>{{ t('chooseReading') }}</legend>
        <label v-for="(choice, index) in pasteChoices" :key="index" class="check-row compact">
          <input v-model="pasteChoice" type="radio" name="paste-order" :value="index" />
          <span>
            <code>{{ readingLabel(choice) }}</code>
          </span>
        </label>
        <button type="button" @click="applyParsed(pasteChoices[pasteChoice])">
          {{ t('useReading') }}
        </button>
      </fieldset>
      <div class="form-grid">
        <label>
          {{ t('name') }}
          <input ref="editorNameInput" v-model="draft.name" required maxlength="256" />
        </label>
        <label>
          {{ t('shortNameDescription') }}
          <input v-model="draft.shortName" pattern="[A-Za-z0-9]{1,3}" maxlength="3" />
        </label>
        <label>
          {{ t('color') }}
          <input v-model="draft.color" type="color" />
        </label>
        <label>
          {{ t('checkUrl') }}
          <input v-model="draft.checkUrl" type="url" required />
        </label>
      </div>
      <label>
        {{ t('note') }}
        <textarea v-model="draft.note" rows="3" maxlength="4096" />
      </label>
      <label class="check-row">
        <input v-model="draft.useSameProxy" type="checkbox" />
        <span>
          <strong>{{ t('useHttpForAll') }}</strong>
          <small>{{ t('useHttpForAllDescription') }}</small>
        </span>
      </label>

      <fieldset class="endpoint-fieldset">
        <legend>{{ t('httpWsEndpoint') }}</legend>
        <div class="endpoint-grid">
          <label>
            {{ t('transport') }}
            <select v-model="draft.httpEndpoint.transport">
              <option value="HTTP">{{ t('httpProxy') }}</option>
              <option value="HTTPS">{{ t('httpsProxy') }}</option>
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
          <label>
            {{ t('username') }}
            <input v-model="draft.httpEndpoint.username" autocomplete="off" />
          </label>
          <label>
            {{ t('password') }}
            <input
              v-model="draft.httpEndpoint.password"
              :type="revealPasswords ? 'text' : 'password'"
              autocomplete="new-password"
            />
          </label>
        </div>
      </fieldset>

      <fieldset v-if="!draft.useSameProxy" class="endpoint-fieldset">
        <legend>{{ t('httpsWssEndpoint') }}</legend>
        <div class="endpoint-grid">
          <label>
            {{ t('transport') }}
            <select v-model="draft.httpsEndpoint.transport">
              <option value="HTTP">{{ t('httpProxy') }}</option>
              <option value="HTTPS">{{ t('httpsProxy') }}</option>
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
          <label>
            {{ t('username') }}
            <input v-model="draft.httpsEndpoint.username" autocomplete="off" />
          </label>
          <label>
            {{ t('password') }}
            <input
              v-model="draft.httpsEndpoint.password"
              :type="revealPasswords ? 'text' : 'password'"
              autocomplete="new-password"
            />
          </label>
        </div>
      </fieldset>
      <p v-else class="notice">
        {{ t('effectiveHttpsEndpoint') }} {{ effectiveHttps.transport }}
        {{ effectiveHttps.host || t('hostNotSet') }}:{{ effectiveHttps.port }}
      </p>
      <label class="check-row">
        <input v-model="revealPasswords" type="checkbox" />
        <span>{{ t('showPasswords') }}</span>
      </label>
      <div class="button-row">
        <button class="primary" type="submit" :disabled="busy">
          {{ t('saveProfile') }}
        </button>
        <button type="button" @click="closeEditor">
          {{ t('cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.profile-title input[type='checkbox'] {
  width: 18px;
  min-height: 18px;
  height: 18px;
  flex: none;
  margin: 0;
}

.paste-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: end;
}
</style>
