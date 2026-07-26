<script setup lang="ts">
import { reactive } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type { GeneralSettings } from '../../domain/types/entities'
import { t } from '../../i18n/messages'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()

const settings = reactive<GeneralSettings>({
  ...props.state.config.general,
})

const save = (): void => {
  emit('command', {
    settings: { ...settings },
    type: 'UPDATE_GENERAL',
  })
}
</script>

<template>
  <div class="stack">
    <article class="surface card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">
            {{ t('connectionPolicy') }}
          </p>
          <h2>{{ t('globalRouting') }}</h2>
          <p>{{ t('globalRoutingDescription') }}</p>
        </div>
        <span class="status-pill" :class="{ danger: state.diagnostics.lastApplyError !== null }">
          {{ state.diagnostics.controlStatus.replaceAll('_', ' ') }}
        </span>
      </div>

      <fieldset class="segmented" :disabled="busy">
        <legend class="sr-only">
          {{ t('globalRoutingMode') }}
        </legend>
        <button
          v-for="mode in ['DIRECT', 'PROXY', 'RULES'] as const"
          :key="mode"
          type="button"
          :aria-pressed="state.config.general.mode === mode"
          @click="emit('command', { mode, type: 'SET_MODE' })"
        >
          {{ mode }}
        </button>
      </fieldset>

      <label>
        {{ t('globalProxyProfile') }}
        <select
          :value="state.config.general.activeProxyProfileId ?? ''"
          :disabled="busy || state.config.profiles.length === 0"
          @change="
            emit('command', {
              profileId: ($event.target as HTMLSelectElement).value,
              type: 'USE_PROFILE',
            })
          "
        >
          <option value="" disabled>{{ t('selectProfile') }}</option>
          <option v-for="profile in state.config.profiles" :key="profile.id" :value="profile.id">
            {{ profile.name }} ({{ profile.shortName ?? profile.generatedShortName }})
          </option>
        </select>
      </label>

      <p v-if="state.diagnostics.lastApplyError" class="notice danger" role="alert">
        {{ t('applyFailurePrefix') }} {{ state.diagnostics.persistedRevision }}
        {{ t('applyFailureSuffix') }}
        {{ state.diagnostics.lastApplyError }}
      </p>
    </article>

    <form class="surface card stack" @submit.prevent="save">
      <div>
        <p class="eyebrow">
          {{ t('privacyControls') }}
        </p>
        <h2>{{ t('loggingAndErrors') }}</h2>
      </div>

      <label class="check-row">
        <input v-model="settings.loggingEnabled" type="checkbox" />
        <span>
          <strong>{{ t('enableLocalLog') }}</strong>
          <small>{{ t('enableLocalLogDescription') }}</small>
        </span>
      </label>
      <label class="check-row">
        <input v-model="settings.loggingPaused" type="checkbox" />
        <span>
          <strong>{{ t('pauseLogging') }}</strong>
          <small>{{ t('pauseLoggingDescription') }}</small>
        </span>
      </label>
      <label>
        {{ t('collectionMode') }}
        <select v-model="settings.loggingMode">
          <option value="NAVIGATIONS_AND_FAILURES">{{ t('navigationsAndFailures') }}</option>
          <option value="ALL_SUPPORTED_REQUESTS">{{ t('allSupportedRequests') }}</option>
        </select>
      </label>
      <label class="check-row">
        <input v-model="settings.errorPageEnabled" type="checkbox" />
        <span>
          <strong>{{ t('bestEffortErrorPage') }}</strong>
          <small>{{ t('bestEffortErrorPageDescription') }}</small>
        </span>
      </label>

      <div class="form-grid">
        <label>
          {{ t('manualCheckEndpoint') }}
          <input
            v-model="settings.ipGeoProviderEndpoint"
            type="url"
            maxlength="2048"
            autocomplete="off"
            required
          />
        </label>
        <label>
          {{ t('timeoutMilliseconds') }}
          <input
            v-model.number="settings.proxyCheckTimeoutMs"
            type="number"
            min="1000"
            max="120000"
            step="500"
            required
          />
        </label>
      </div>
      <label class="check-row">
        <input v-model="settings.geoIpEnabled" type="checkbox" />
        <span>
          <strong>{{ t('readCountry') }}</strong>
          <small>{{ t('readCountryDescription') }}</small>
        </span>
      </label>
      <button class="primary" type="submit" :disabled="busy">
        {{ t('saveGeneralSettings') }}
      </button>
    </form>

    <article class="surface card">
      <p class="eyebrow">
        {{ t('privateBrowsing') }}
      </p>
      <h2>{{ t('incognitoAccess') }}</h2>
      <p>
        {{ t('browserPermission') }}
        <strong>
          {{
            state.diagnostics.incognitoAllowed === null
              ? t('unknown')
              : state.diagnostics.incognitoAllowed
                ? t('allowed')
                : t('notAllowed')
          }}
        </strong>
      </p>
      <p class="notice">
        {{ t('incognitoPermissionDescription') }}
      </p>
      <p>
        {{
          state.diagnostics.incognitoHelp === 'FIREFOX_MANAGE_EXTENSION'
            ? t('incognitoHelpFirefox')
            : t('incognitoHelpChromium')
        }}
      </p>
    </article>
  </div>
</template>
