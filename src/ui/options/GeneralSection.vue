<script setup lang="ts">
import { EyeOff, Route, Save, ShieldCheck } from '@lucide/vue'
import { reactive } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type { GeneralSettings } from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { controlStatusLabel, modeLabel } from '../labels'
import HelpTip from '../components/HelpTip.vue'

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
    <article class="surface card stack">
      <div class="card-heading">
        <Route :size="20" aria-hidden="true" />
        <div>
          <h2 class="title-with-tip">
            {{ t('globalRouting') }}
            <HelpTip :text="t('tipModes')" article="modes" />
          </h2>
          <p>{{ t('globalRoutingDescription') }}</p>
        </div>
        <span class="status-pill" :class="{ danger: state.diagnostics.lastApplyError !== null }">
          {{ controlStatusLabel(state.diagnostics.controlStatus) }}
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
          {{ modeLabel(mode) }}
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
      <div class="card-heading">
        <ShieldCheck :size="20" aria-hidden="true" />
        <div>
          <h2>{{ t('loggingAndErrors') }}</h2>
          <p>{{ t('privacyControls') }}</p>
        </div>
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

      <label class="check-row">
        <input v-model="settings.confirmDangerousActions" type="checkbox" />
        <span>
          <strong>{{ t('confirmDangerousActions') }}</strong>
          <small>{{ t('confirmDangerousActionsDescription') }}</small>
        </span>
      </label>

      <div class="form-grid">
        <div class="field">
          <span class="field-label">
            <label for="check-endpoint">{{ t('manualCheckEndpoint') }}</label>
            <HelpTip :text="t('tipCheckEndpoint')" article="check" />
          </span>
          <input
            id="check-endpoint"
            v-model="settings.ipGeoProviderEndpoint"
            type="url"
            maxlength="2048"
            autocomplete="off"
            required
          />
        </div>
        <div class="field">
          <span class="field-label">
            <label for="speed-endpoint">{{ t('speedTestEndpoint') }}</label>
            <HelpTip :text="t('tipSpeedEndpoint')" article="check" />
          </span>
          <input
            id="speed-endpoint"
            v-model="settings.speedTestEndpoint"
            type="url"
            maxlength="2048"
            autocomplete="off"
            required
          />
        </div>
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
      <div class="form-actions">
        <button class="primary" type="submit" :disabled="busy">
          <Save :size="16" aria-hidden="true" />
          {{ t('saveGeneralSettings') }}
        </button>
      </div>
    </form>

    <article class="surface card stack">
      <div class="card-heading">
        <EyeOff :size="20" aria-hidden="true" />
        <div>
          <h2>{{ t('incognitoAccess') }}</h2>
          <p>{{ t('privateBrowsing') }}</p>
        </div>
      </div>
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

<style scoped>
.form-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}
</style>
