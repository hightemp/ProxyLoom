<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, watch } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type { ProxyEndpoint, ProxyProfile, ProxyTransport } from '../../domain/types/entities'
import { t } from '../../i18n/messages'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()

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

const create = (event: MouseEvent): void => {
  editorActivator = event.currentTarget as HTMLElement
  editingId.value = null
  replaceDraft(blankProfile())
  formOpen.value = true
  void nextTick(() => editorNameInput.value?.focus())
}

const edit = (profile: ProxyProfile, event: MouseEvent): void => {
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

const remove = (profile: ProxyProfile): void => {
  const usedBy = props.state.config.rules.filter(
    (rule) => rule.action.targetProxyProfileId === profile.id,
  )
  const impact = [
    props.state.config.general.activeProxyProfileId === profile.id ? t('activeGlobalRoute') : '',
    usedBy.length > 0 ? `${usedBy.length} ${t('rulesAffected')}` : '',
  ].filter(Boolean)
  const confirmed =
    impact.length === 0 ||
    window.confirm(
      `${t('deleteProfileBeforeName')} “${profile.name}”? ${t('deleteProfileAffects')} ${impact.join(` ${t('and')} `)}. ${t('deleteProfileInvalidRules')}`,
    )
  if (confirmed) {
    emit('command', {
      confirmed: true,
      profileId: profile.id,
      type: 'DELETE_PROFILE',
    })
  }
}

const check = (profile: ProxyProfile): void => {
  if (
    !window.confirm(
      `${t('manualCheckBeforeUrl')} ${profile.checkUrl} ${t('manualCheckThrough')} “${profile.name}”? ${t('manualCheckDisclosure')}`,
    )
  ) {
    return
  }
  checkingId.value = profile.id
  emit('command', { profileId: profile.id, type: 'CHECK_PROFILE' })
}

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
        <p class="eyebrow">
          {{ t('endpoints') }}
        </p>
        <h2>{{ t('proxyProfiles') }}</h2>
        <p>{{ t('proxyProfilesDescription') }}</p>
      </div>
      <button class="primary" type="button" :disabled="busy" @click="create($event)">
        {{ t('addProfile') }}
      </button>
    </div>

    <p class="notice">
      {{ t('credentialsStorageNotice') }}
    </p>

    <div v-if="state.config.profiles.length === 0" class="surface empty-state">
      <strong>{{ t('noProxyProfiles') }}</strong>
      <p>{{ t('noProxyProfilesDescription') }}</p>
    </div>

    <div v-else class="card-grid">
      <article
        v-for="profile in state.config.profiles"
        :key="profile.id"
        class="surface card profile-card"
      >
        <div class="profile-title">
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
            {{ profile.lastCheck.externalIp ?? profile.lastCheck.errorCode ?? t('noIp') }}
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
            @click="checkingId === profile.id && busy ? cancelCheck() : check(profile)"
          >
            {{ checkingId === profile.id && busy ? t('cancelCheck') : t('check') }}
          </button>
          <button class="danger-text" type="button" :disabled="busy" @click="remove(profile)">
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
