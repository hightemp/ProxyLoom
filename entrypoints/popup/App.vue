<script setup lang="ts">
import { Clock, Link, Pin, ScrollText, Settings } from '@lucide/vue'
import { computed, onMounted, shallowRef } from 'vue'

import type { OverridePreview } from '../../src/application/overrides/override-service'
import { overridesForSite } from '../../src/application/overrides/site-overrides'
import type { AppRuntimeState, RuntimeRequest } from '../../src/application/runtime/contracts'
import { formatProfile } from '../../src/domain/profiles/proxy-format'
import { asProxyProfileId } from '../../src/domain/types/brand'
import type { GlobalMode, OverrideScope, RuleAction } from '../../src/domain/types/entities'
import { applyDocumentLanguage, t, type MessageKey } from '../../src/i18n/messages'
import { copyText } from '../../src/ui/clipboard'
import ConfirmDialog from '../../src/ui/components/ConfirmDialog.vue'
import { applyAppearance } from '../../src/ui/theme/accents'
import { countryDisplay } from '../../src/ui/flags/country'
import CountryFlag from '../../src/ui/components/CountryFlag.vue'
import ProfileChip from '../../src/ui/components/ProfileChip.vue'
import { confirmController } from '../../src/ui/confirm/confirm-controller'
import {
  checkErrorLabel,
  decisionActionLabel,
  decisionSourceLabel,
  errorText,
  inspectionReasonLabel,
  modeLabel,
} from '../../src/ui/labels'
import SiteOverrides from '../../src/ui/popup/SiteOverrides.vue'
import HelpTip from '../../src/ui/components/HelpTip.vue'
import { runtimeClient } from '../../src/ui/runtime/client'

applyDocumentLanguage(document.documentElement)

const PROFILE_PREFIX = 'PROFILE:'
type RouteValue = 'DIRECT' | `PROFILE:${string}`

const MODE_DESCRIPTIONS: Record<GlobalMode, MessageKey> = {
  DIRECT: 'modeDescriptionDirect',
  PROXY: 'modeDescriptionProxy',
  RULES: 'modeDescriptionRules',
}

const state = shallowRef<AppRuntimeState | null>(null)
const busy = shallowRef(false)
const error = shallowRef('')
const info = shallowRef('')
const scope = shallowRef<OverrideScope>('EXACT_HOSTNAME')
const siteRoute = shallowRef<RouteValue>('DIRECT')
const requestedTabId = (() => {
  const raw = new URLSearchParams(window.location.search).get('tab')
  if (raw === null || !/^\d+$/u.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : undefined
})()
const tabContext = requestedTabId === undefined ? {} : { tabId: requestedTabId }

const inspection = computed(() => state.value?.inspection ?? null)
const profileById = (id: string | null) =>
  id === null ? undefined : state.value?.config.profiles.find((profile) => profile.id === id)

const decision = computed(() => {
  const current = inspection.value
  return current?.supported === true ? current.decision : null
})
const decisionProfile = computed(() => profileById(decision.value?.profileId ?? null) ?? null)
const sourceText = computed(() => {
  const current = decision.value
  if (current === null) return ''
  if (current.source !== 'RULE' || current.matchedRuleId === null) {
    return decisionSourceLabel(current.source)
  }
  const rule = state.value?.config.rules.find((entry) => entry.id === current.matchedRuleId)
  return t('sourceRuleNamed', rule?.name ?? t('missingRule'))
})

const activeProfile = computed(() =>
  profileById(state.value?.config.general.activeProxyProfileId ?? null),
)
const lastCheckText = computed(() => {
  const check = activeProfile.value?.lastCheck
  if (check === undefined) return ''
  if (check === null) return t('neverChecked')
  const duration = `${Math.round(check.totalDurationMs)} ${t('millisecondsShort')}`
  return check.availability
    ? [t('available'), duration].join(' · ')
    : [t('unavailable'), check.errorCode === null ? '' : checkErrorLabel(check.errorCode)]
        .filter(Boolean)
        .join(' · ')
})

const lastCheckCountry = computed(() => {
  const check = activeProfile.value?.lastCheck
  return check?.availability === true && check.country !== null
    ? countryDisplay(check.country)
    : null
})

const hasOwnOverride = computed(() => {
  const current = inspection.value
  if (state.value === null || current === null || !current.supported) return false
  return overridesForSite(state.value.overrides, current.hostname).some(
    (override) => override.sourceTabId === state.value?.activeTabId,
  )
})

const action = (): RuleAction =>
  siteRoute.value === 'DIRECT'
    ? { targetProxyProfileId: null, type: 'DIRECT' }
    : {
        targetProxyProfileId: asProxyProfileId(siteRoute.value.slice(PROFILE_PREFIX.length)),
        type: 'PROXY',
      }

const load = async (): Promise<void> => {
  const result = await runtimeClient.getState(undefined, requestedTabId)
  if (!result.ok) {
    error.value = errorText(result.error)
    return
  }
  state.value = result.value
  applyAppearance(document.documentElement, result.value.config.appearance)
}

const execute = async (request: RuntimeRequest): Promise<void> => {
  busy.value = true
  error.value = ''
  info.value = ''
  const result = await runtimeClient.command<unknown>(request)
  busy.value = false
  if (!result.ok) {
    error.value = errorText(result.error)
    return
  }
  await load()
}

const copyActiveUrl = async (): Promise<void> => {
  const profile = activeProfile.value
  if (profile === undefined) return
  error.value = ''
  info.value = ''
  if (!(await copyText(formatProfile(profile, 'URL')))) {
    error.value = t('copyFailed')
    return
  }
  const withPassword = profile.httpEndpoint.username !== '' || profile.httpEndpoint.password !== ''
  info.value = withPassword ? t('copiedWithPassword') : t('copied')
}

const siteAction = async (persistent: boolean): Promise<void> => {
  const previewResult = await runtimeClient.command<OverridePreview>({
    scope: scope.value,
    ...tabContext,
    type: 'PREVIEW_SITE_ACTION',
  })
  if (!previewResult.ok) {
    error.value = errorText(previewResult.error)
    return
  }
  const preview = previewResult.value
  const route = action()
  const routeProfile = profileById(route.targetProxyProfileId)
  const confirmed = await confirmController.request({
    code: preview.generatedPattern,
    confirmLabel: t('create'),
    details: [
      `${t('route')}: ${routeProfile === undefined ? decisionActionLabel('DIRECT') : routeProfile.name}`,
      ...(preview.chromiumScopeWarning && !persistent ? [t('temporaryOverrideWarning')] : []),
    ],
    message: t('siteActionMessage'),
    title: persistent ? t('createPermanentRule') : t('createTemporaryOverride'),
  })
  if (!confirmed) return
  await execute({
    action: route,
    scope: scope.value,
    ...tabContext,
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
      <img src="/icon.svg" alt="" width="20" height="20" />
      <strong>{{ t('extensionName') }}</strong>
      <span
        v-if="state"
        class="status-pill"
        :class="{ danger: state.diagnostics.lastApplyError !== null }"
      >
        {{ modeLabel(state.config.general.mode) }}
      </span>
    </header>

    <div v-if="state === null" class="surface empty-state" role="status">
      {{ error || t('loading') }}
    </div>
    <template v-else>
      <section class="surface current-site" :aria-label="t('currentSite')">
        <span class="eyebrow">{{ t('currentSite') }}</span>
        <template v-if="inspection?.supported && decision">
          <h1>{{ inspection.hostname }}</h1>
          <small class="route-line">
            <span v-if="decision.action === 'CONFIG_ERROR'" class="profile-error">
              {{ decisionActionLabel('CONFIG_ERROR') }}
            </span>
            <ProfileChip
              v-else
              :profile="decisionProfile"
              :missing="decision.action === 'PROXY' && decisionProfile === null"
            />
            · {{ sourceText }}
          </small>
          <button
            v-if="decision.matchedRuleId"
            class="link-button"
            type="button"
            @click="execute({ section: 'rules', type: 'OPEN_SETTINGS' })"
          >
            {{ t('editMatchedRule') }}
          </button>
        </template>
        <template v-else>
          <h1>{{ t('unsupportedPage') }}</h1>
          <small>
            {{
              inspection && !inspection.supported
                ? inspectionReasonLabel(inspection.reason)
                : t('noActiveTab')
            }}
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

      <section
        v-if="inspection?.supported"
        class="site-actions"
        :aria-label="t('siteActionsTitle')"
      >
        <div class="form-grid">
          <label>
            {{ t('scope') }}
            <select v-model="scope">
              <option value="EXACT_HOSTNAME">{{ t('exactHostname') }}</option>
              <option value="REGISTRABLE_DOMAIN">{{ t('domainSubdomains') }}</option>
            </select>
          </label>
          <label>
            {{ t('route') }}
            <select v-model="siteRoute" name="site-route">
              <option value="DIRECT">{{ decisionActionLabel('DIRECT') }}</option>
              <option
                v-for="profile in state.config.profiles"
                :key="profile.id"
                :value="`${PROFILE_PREFIX}${profile.id}`"
              >
                {{ profile.name }} ({{ profile.shortName ?? profile.generatedShortName }})
              </option>
            </select>
          </label>
        </div>
        <p class="hint with-tip">
          {{ t('tipOnce') }}
          <HelpTip :text="t('helpOnceBody2')" article="once" external />
        </p>
        <p v-if="inspection.scopeWarning" class="hint">
          {{ t('temporaryOverrideWarning') }}
        </p>
        <div class="button-row">
          <button class="primary" type="button" :disabled="busy" @click="siteAction(false)">
            <Clock :size="16" aria-hidden="true" />
            {{ hasOwnOverride ? t('updateOnce') : t('once') }}
          </button>
          <button type="button" :disabled="busy" @click="siteAction(true)">
            <Pin :size="16" aria-hidden="true" />
            {{ t('alwaysCreateRule') }}
          </button>
        </div>
      </section>

      <section class="global" :aria-label="t('globalMode')">
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
        <p class="hint">
          {{ t(MODE_DESCRIPTIONS[state.config.general.mode]) }}
        </p>
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
        <div v-if="activeProfile" class="global-status">
          <ProfileChip :profile="activeProfile" />
          <small>{{ lastCheckText }}</small>
          <small v-if="lastCheckCountry" class="check-country" :title="lastCheckCountry.name">
            <CountryFlag v-if="lastCheckCountry.code" :code="lastCheckCountry.code" />
            {{ lastCheckCountry.name }}
          </small>
          <button class="link-button" type="button" @click="void copyActiveUrl()">
            <Link :size="14" aria-hidden="true" />
            {{ t('copyUrl') }}
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
      <p v-if="info" class="notice" role="status">
        {{ info }}
      </p>
      <p v-if="error" class="notice danger" role="alert">
        {{ error }}
      </p>

      <footer class="popup-footer">
        <button class="link-button" type="button" @click="execute({ type: 'OPEN_SETTINGS' })">
          <Settings :size="15" aria-hidden="true" />
          {{ t('openSettings') }}
        </button>
        <button
          class="link-button"
          type="button"
          @click="execute({ section: 'logs', type: 'OPEN_SETTINGS' })"
        >
          <ScrollText :size="15" aria-hidden="true" />
          {{ t('logsLink') }}
        </button>
      </footer>
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
  padding: 16px 18px;
}

.popup-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.popup-header strong {
  flex: 1;
}

.current-site {
  display: grid;
  gap: 6px;
  padding: 14px;
}

.current-site h1 {
  margin: 0;
  font-size: 19px;
  line-height: 1.25;
  word-break: break-all;
}

.current-site small,
.route-line {
  color: var(--color-muted);
}

.route-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.profile-error {
  color: var(--color-danger);
  font-weight: 700;
}

.site-actions,
.global {
  display: grid;
  gap: 10px;
}

.with-tip {
  display: flex;
  gap: 4px;
  align-items: flex-start;
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
}

.check-country {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.global-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.global-status small {
  color: var(--color-muted);
}

.popup-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 4px;
  border-top: 1px solid var(--color-border);
}

.notice[role='alert'] {
  display: grid;
  gap: 7px;
}

@media (max-width: 420px) {
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
