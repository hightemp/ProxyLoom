<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../src/application/runtime/contracts'
import { asProxyProfileId } from '../../src/domain/types/brand'
import type { OverrideScope, RuleAction } from '../../src/domain/types/entities'
import { t } from '../../src/i18n/messages'
import type { OverridePreview } from '../../src/application/overrides/override-service'
import { overridesForSite } from '../../src/application/overrides/site-overrides'
import ConfirmDialog from '../../src/ui/components/ConfirmDialog.vue'
import SiteOverrides from '../../src/ui/popup/SiteOverrides.vue'
import { confirmController } from '../../src/ui/confirm/confirm-controller'
import {
  decisionActionLabel,
  decisionSourceLabel,
  errorText,
  inspectionReasonLabel,
  modeLabel,
} from '../../src/ui/labels'
import { runtimeClient } from '../../src/ui/runtime/client'

const state = shallowRef<AppRuntimeState | null>(null)
const busy = shallowRef(false)
const error = shallowRef('')
const scope = shallowRef<OverrideScope>('EXACT_HOSTNAME')
const actionType = shallowRef<'DIRECT' | 'PROXY'>('DIRECT')
const profileId = shallowRef('')
const requestedTabId = (() => {
  const raw = new URLSearchParams(window.location.search).get('tab')
  if (raw === null || !/^\d+$/u.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : undefined
})()

const inspection = computed(() => state.value?.inspection ?? null)
const routeLabel = computed(() => {
  const current = inspection.value
  if (current === null || !current.supported) return t('noSupportedTab')
  const decision = current.decision
  if (decision.action === 'PROXY') {
    const profile = state.value?.config.profiles.find(
      (candidate) => candidate.id === decision.profileId,
    )
    return profile === undefined ? t('invalidProxyRoute') : `${t('via')} ${profile.name}`
  }
  return decision.action === 'DIRECT' ? t('directConnection') : t('configurationError')
})
const matchedRuleName = computed(() => {
  const current = inspection.value
  if (current === null || !current.supported || current.decision.matchedRuleId === null) {
    return null
  }
  return (
    state.value?.config.rules.find((rule) => rule.id === current.decision.matchedRuleId)?.name ??
    t('missingRule')
  )
})

const hasOwnOverride = computed(() => {
  const current = inspection.value
  if (state.value === null || current === null || !current.supported) return false
  return overridesForSite(state.value.overrides, current.hostname).some(
    (override) => override.sourceTabId === state.value?.activeTabId,
  )
})

const action = (): RuleAction => ({
  targetProxyProfileId: actionType.value === 'PROXY' ? asProxyProfileId(profileId.value) : null,
  type: actionType.value,
})

const load = async (): Promise<void> => {
  const result = await runtimeClient.getState(undefined, requestedTabId)
  if (!result.ok) {
    error.value = errorText(result.error)
    return
  }
  state.value = result.value
  profileId.value =
    result.value.config.general.activeProxyProfileId ?? result.value.config.profiles[0]?.id ?? ''
  document.documentElement.dataset.theme =
    result.value.config.appearance.theme.toLocaleLowerCase('en-US')
}

const execute = async (request: RuntimeRequest): Promise<void> => {
  busy.value = true
  error.value = ''
  const result = await runtimeClient.command<unknown>(request)
  busy.value = false
  if (!result.ok) {
    error.value = errorText(result.error)
    return
  }
  await load()
}

const siteAction = async (persistent: boolean): Promise<void> => {
  if (actionType.value === 'PROXY' && profileId.value === '') {
    error.value = t('selectProxyFirst')
    return
  }
  const previewResult = await runtimeClient.command<OverridePreview>({
    scope: scope.value,
    ...(requestedTabId === undefined ? {} : { tabId: requestedTabId }),
    type: 'PREVIEW_SITE_ACTION',
  })
  if (!previewResult.ok) {
    error.value = errorText(previewResult.error)
    return
  }
  const preview = previewResult.value
  const confirmed = await confirmController.request({
    code: preview.generatedPattern,
    confirmLabel: t('create'),
    details: [
      `${t('action')}: ${decisionActionLabel(actionType.value)}`,
      ...(preview.chromiumScopeWarning && !persistent ? [t('temporaryOverrideWarning')] : []),
    ],
    message: t('siteActionMessage'),
    title: persistent ? t('createPermanentRule') : t('createTemporaryOverride'),
  })
  if (!confirmed) return
  await execute({
    action: action(),
    scope: scope.value,
    ...(requestedTabId === undefined ? {} : { tabId: requestedTabId }),
    type: persistent ? 'CREATE_SITE_RULE' : 'CREATE_OVERRIDE',
  })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="popup">
    <header class="popup-header">
      <div>
        <span class="eyebrow">{{ t('extensionName') }}</span>
        <strong>{{ routeLabel }}</strong>
      </div>
      <span
        v-if="state"
        class="status-pill"
        :class="{
          danger: state.diagnostics.lastApplyError !== null,
        }"
      >
        {{ modeLabel(state.config.general.mode) }}
      </span>
    </header>

    <div v-if="state === null" class="surface empty-state" role="status">
      {{ error || t('loading') }}
    </div>
    <template v-else>
      <fieldset class="segmented" :disabled="busy">
        <legend class="sr-only">
          {{ t('globalMode') }}
        </legend>
        <button
          v-for="mode in ['DIRECT', 'PROXY', 'RULES'] as const"
          :key="mode"
          type="button"
          :aria-pressed="state.config.general.mode === mode"
          @click="execute({ mode, type: 'SET_MODE' })"
        >
          {{ modeLabel(mode) }}
        </button>
      </fieldset>

      <label>
        {{ t('useProxyGlobally') }}
        <select
          :value="state.config.general.activeProxyProfileId ?? ''"
          :disabled="busy || state.config.profiles.length === 0"
          @change="
            execute({
              profileId: ($event.target as HTMLSelectElement).value,
              type: 'USE_PROFILE',
            })
          "
        >
          <option value="" disabled>{{ t('selectProfileShort') }}</option>
          <option v-for="profile in state.config.profiles" :key="profile.id" :value="profile.id">
            {{ profile.name }}
          </option>
        </select>
      </label>

      <section class="surface current-site">
        <span class="eyebrow">{{ t('currentSite') }}</span>
        <template v-if="inspection?.supported">
          <strong>{{ inspection.hostname }}</strong>
          <small>
            {{ decisionActionLabel(inspection.decision.action) }} ·
            {{ decisionSourceLabel(inspection.decision.source) }}
            {{ matchedRuleName === null ? '' : `· ${matchedRuleName}` }}
          </small>
          <p v-if="inspection.scopeWarning" class="notice">
            {{ t('temporaryOverrideWarning') }}
          </p>
        </template>
        <template v-else>
          <strong>{{ t('unsupportedPage') }}</strong>
          <small>
            {{ inspection ? inspectionReasonLabel(inspection.reason) : t('noActiveTab') }}
          </small>
        </template>
      </section>

      <SiteOverrides
        v-if="inspection?.supported"
        :overrides="state.overrides"
        :hostname="inspection.hostname"
        :active-tab-id="state.activeTabId"
        :profiles="state.config.profiles"
        :busy="busy"
        :tab-id="requestedTabId"
        @command="execute"
      />

      <section class="site-actions" :aria-disabled="!inspection?.supported">
        <div class="form-grid">
          <label>
            {{ t('scope') }}
            <select v-model="scope" :disabled="!inspection?.supported">
              <option value="EXACT_HOSTNAME">{{ t('exactHostname') }}</option>
              <option value="REGISTRABLE_DOMAIN">{{ t('domainSubdomains') }}</option>
            </select>
          </label>
          <label>
            {{ t('route') }}
            <select v-model="actionType" :disabled="!inspection?.supported">
              <option value="DIRECT">{{ t('directLabel') }}</option>
              <option value="PROXY">{{ t('proxyLabel') }}</option>
            </select>
          </label>
        </div>
        <label v-if="actionType === 'PROXY'">
          {{ t('proxyProfile') }}
          <select v-model="profileId" :disabled="!inspection?.supported">
            <option value="" disabled>{{ t('selectProfileShort') }}</option>
            <option v-for="profile in state.config.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>
        <div class="button-row">
          <button
            type="button"
            :disabled="busy || !inspection?.supported"
            @click="siteAction(false)"
          >
            {{ hasOwnOverride ? t('updateOnce') : t('once') }}
          </button>
          <button
            type="button"
            :disabled="busy || !inspection?.supported"
            @click="siteAction(true)"
          >
            {{ t('alwaysCreateRule') }}
          </button>
          <button
            v-if="inspection?.supported && inspection.decision.matchedRuleId"
            type="button"
            @click="execute({ section: 'rules', type: 'OPEN_SETTINGS' })"
          >
            {{ t('editMatchedRule') }}
          </button>
        </div>
      </section>

      <div v-if="state.diagnostics.lastApplyError" class="notice danger" role="alert">
        <strong>{{ t('routingApplyFailed') }}</strong>
        <code>{{ state.diagnostics.lastApplyError }}</code>
        <button type="button" :disabled="busy" @click="execute({ type: 'RETRY_APPLY' })">
          {{ t('retryApply') }}
        </button>
      </div>
      <p v-if="error" class="notice danger" role="alert">
        {{ error }}
      </p>
      <button class="settings" type="button" @click="execute({ type: 'OPEN_SETTINGS' })">
        {{ t('openSettings') }}
      </button>
    </template>
    <ConfirmDialog />
  </main>
</template>

<style scoped>
.popup {
  display: grid;
  gap: 14px;
  width: 390px;
  max-height: 600px;
  overflow-y: auto;
  padding: 18px;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}

.popup-header div {
  display: grid;
  gap: 3px;
}

.current-site {
  display: grid;
  gap: 5px;
  padding: 14px;
}

.current-site small {
  color: var(--color-muted);
}

.site-actions {
  display: grid;
  gap: 10px;
}

.settings {
  border-color: transparent;
  color: var(--color-primary);
  background: transparent;
}

.notice[role='alert'] {
  display: grid;
  gap: 7px;
}

@media (max-width: 420px) {
  .popup-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .segmented {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .segmented button {
    min-width: 0;
    padding-inline: 4px;
    font-size: 12px;
  }
}
</style>
