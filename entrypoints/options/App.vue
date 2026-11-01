<script setup lang="ts">
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Info,
  ListOrdered,
  LoaderCircle,
  Palette,
  ScrollText,
  Server,
  SlidersHorizontal,
} from '@lucide/vue'
import type { Component } from 'vue'
import { browser } from 'wxt/browser'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../src/application/runtime/contracts'
import type { LogQuery } from '../../src/application/logging/log-types'
import { t } from '../../src/i18n/messages'
import ConfirmDialog from '../../src/ui/components/ConfirmDialog.vue'
import { applyAppearance } from '../../src/ui/theme/accents'
import ToastHost from '../../src/ui/components/ToastHost.vue'
import { toastController } from '../../src/ui/toast/toast-controller'
import { applyStateLabel, errorText, modeLabel } from '../../src/ui/labels'
import AppearanceSection from '../../src/ui/options/AppearanceSection.vue'
import DiagnosticsSection from '../../src/ui/options/DiagnosticsSection.vue'
import GeneralSection from '../../src/ui/options/GeneralSection.vue'
import ImportExportSection from '../../src/ui/options/ImportExportSection.vue'
import LogsSection from '../../src/ui/options/LogsSection.vue'
import OverridesSection from '../../src/ui/options/OverridesSection.vue'
import ProfilesSection from '../../src/ui/options/ProfilesSection.vue'
import RulesSection from '../../src/ui/options/RulesSection.vue'
import { runtimeClient } from '../../src/ui/runtime/client'

type SectionId =
  'general' | 'proxies' | 'rules' | 'overrides' | 'logs' | 'import-export' | 'appearance' | 'about'

const sections: readonly {
  readonly id: SectionId
  readonly label: string
  readonly eyebrow: string
  readonly icon: Component
}[] = [
  {
    eyebrow: t('sectionGeneralEyebrow'),
    id: 'general',
    icon: SlidersHorizontal,
    label: t('sectionGeneral'),
  },
  { eyebrow: t('sectionProxiesEyebrow'), id: 'proxies', icon: Server, label: t('sectionProxies') },
  { eyebrow: t('sectionRulesEyebrow'), id: 'rules', icon: ListOrdered, label: t('sectionRules') },
  {
    eyebrow: t('sectionOverridesEyebrow'),
    id: 'overrides',
    icon: Clock,
    label: t('sectionOverrides'),
  },
  { eyebrow: t('sectionLogsEyebrow'), id: 'logs', icon: ScrollText, label: t('sectionLogs') },
  {
    eyebrow: t('sectionImportExportEyebrow'),
    id: 'import-export',
    icon: ArrowLeftRight,
    label: t('sectionImportExport'),
  },
  {
    eyebrow: t('sectionAppearanceEyebrow'),
    id: 'appearance',
    icon: Palette,
    label: t('appearanceTitle'),
  },
  { eyebrow: t('sectionAboutEyebrow'), id: 'about', icon: Info, label: t('diagnosticsTitle') },
]

const selected = shallowRef<SectionId>('general')
const state = shallowRef<AppRuntimeState | null>(null)
const loading = shallowRef(true)
const busy = shallowRef(false)
const message = shallowRef('')
const messageIsError = shallowRef(false)

const selectedMeta = computed(
  () => sections.find((section) => section.id === selected.value) ?? sections[0]!,
)

const applyTheme = (next: AppRuntimeState): void => {
  applyAppearance(document.documentElement, next.config.appearance)
}

const setStatus = (value: string, error = false): void => {
  message.value = value
  messageIsError.value = error
  toastController.show(value, error)
}

const load = async (logQuery?: LogQuery): Promise<void> => {
  const result = await runtimeClient.getState(logQuery)
  loading.value = false
  if (!result.ok) {
    setStatus(errorText(result.error), true)
    return
  }
  state.value = result.value
  applyTheme(result.value)
}

const execute = async (request: RuntimeRequest): Promise<void> => {
  busy.value = true
  message.value = ''
  toastController.dismiss()
  const result = await runtimeClient.command<unknown>(request)
  busy.value = false
  if (!result.ok) {
    setStatus(errorText(result.error), true)
    return
  }
  if (
    typeof result.value === 'object' &&
    result.value !== null &&
    'config' in result.value &&
    'diagnostics' in result.value
  ) {
    state.value = result.value as AppRuntimeState
    applyTheme(state.value)
  } else {
    await load()
  }
  setStatus(t('savedAndApplied'))
}

const select = (section: SectionId): void => {
  selected.value = section
  history.replaceState(null, '', `#${section}`)
  document.querySelector<HTMLElement>('#settings-content')?.focus()
}

const syncHash = (): void => {
  const candidate = location.hash.slice(1)
  if (sections.some(({ id }) => id === candidate)) {
    selected.value = candidate as SectionId
  }
}

const storageChanged = (): void => {
  if (!busy.value) void load()
}

onMounted(() => {
  syncHash()
  window.addEventListener('hashchange', syncHash)
  browser.storage.onChanged.addListener(storageChanged)
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncHash)
  browser.storage.onChanged.removeListener(storageChanged)
})
</script>

<template>
  <div class="settings-shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" src="/icon.svg" alt="" width="38" height="38" />
        <div>
          <strong>{{ t('extensionName') }}</strong>
          <small>{{ t('deterministicRouting') }}</small>
        </div>
      </div>
      <nav :aria-label="t('settings')">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :aria-current="selected === section.id ? 'page' : undefined"
          @click="select(section.id)"
        >
          <component :is="section.icon" :size="17" aria-hidden="true" />
          <span>{{ section.label }}</span>
        </button>
      </nav>
      <div
        v-if="state"
        class="sidebar-status"
        :class="{ danger: state.diagnostics.lastApplyError }"
      >
        <AlertTriangle v-if="state.diagnostics.lastApplyError" :size="16" aria-hidden="true" />
        <LoaderCircle v-else-if="busy" :size="16" aria-hidden="true" class="spin" />
        <CheckCircle2 v-else :size="16" aria-hidden="true" />
        <span>
          <strong>{{ modeLabel(state.config.general.mode) }}</strong>
          <small>{{ applyStateLabel(busy, state.diagnostics.lastApplyError) }}</small>
        </span>
      </div>
    </aside>

    <main id="settings-content" class="content" tabindex="-1">
      <header class="page-header">
        <div>
          <h1>{{ selectedMeta.label }}</h1>
          <p>{{ selectedMeta.eyebrow }}</p>
        </div>
        <span v-if="busy" class="status-pill" role="status"> {{ t('applying') }} </span>
      </header>

      <div v-if="loading" class="surface empty-state" role="status">
        <strong>{{ t('loadingSettings') }}</strong>
      </div>
      <div v-else-if="state === null" class="surface empty-state">
        <strong>{{ t('settingsUnavailable') }}</strong>
        <p>{{ message || t('backgroundInvalidConfiguration') }}</p>
        <button type="button" @click="load()">
          {{ t('retry') }}
        </button>
      </div>
      <template v-else>
        <GeneralSection
          v-if="selected === 'general'"
          :key="`general-${state.config.revision}`"
          :state="state"
          :busy="busy"
          @command="execute"
        />
        <ProfilesSection
          v-else-if="selected === 'proxies'"
          :state="state"
          :busy="busy"
          @command="execute"
          @refresh="load"
          @status="setStatus"
        />
        <RulesSection
          v-else-if="selected === 'rules'"
          :state="state"
          :busy="busy"
          @command="execute"
        />
        <OverridesSection
          v-else-if="selected === 'overrides'"
          :state="state"
          :busy="busy"
          @command="execute"
        />
        <LogsSection
          v-else-if="selected === 'logs'"
          :state="state"
          :busy="busy"
          @command="execute"
          @reload-logs="load"
        />
        <ImportExportSection
          v-else-if="selected === 'import-export'"
          :state="state"
          :busy="busy"
          @refresh="load"
          @status="setStatus"
        />
        <AppearanceSection
          v-else-if="selected === 'appearance'"
          :state="state"
          :busy="busy"
          @command="execute"
        />
        <DiagnosticsSection v-else :state="state" />
      </template>
    </main>
    <ConfirmDialog />
    <ToastHost />
  </div>
</template>

<style scoped>
.settings-shell {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 100vh;
  /* Paint the sidebar column for pages taller than the viewport. */
  background: linear-gradient(to right, var(--color-surface) 232px, transparent 232px);
}

.sidebar {
  position: sticky;
  top: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-6);
  height: 100vh;
  padding: var(--space-5) var(--space-3);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 0 var(--space-2);
}

.brand-mark {
  display: block;
  width: 32px;
  height: 32px;
  flex: none;
}

.brand div {
  display: grid;
}

.brand small {
  font-size: 12px;
}

nav {
  display: grid;
  align-content: start;
  gap: 2px;
}

nav button {
  justify-content: flex-start;
  gap: 10px;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  color: var(--color-muted);
  background: transparent;
  box-shadow: none;
  font-weight: 500;
}

nav button:hover:not(:disabled) {
  border: 0;
  color: var(--color-text);
  background: var(--color-surface-2);
}

nav button[aria-current='page'] {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-weight: 600;
}

.sidebar-status {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-success);
  background: var(--color-surface-2);
}

.sidebar-status.danger {
  color: var(--color-danger);
}

.sidebar-status span {
  display: grid;
  color: var(--color-text);
}

.sidebar-status small {
  font-size: 12px;
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

.content {
  display: grid;
  align-content: start;
  gap: var(--space-5);
  width: 100%;
  max-width: 1080px;
  padding: var(--space-8) var(--space-8) 80px;
}

.page-header {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  justify-content: space-between;
}

.page-header div {
  display: grid;
  gap: 4px;
}

.page-header p {
  color: var(--color-muted);
}

@media (max-width: 760px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    grid-template-rows: auto auto;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar nav {
    display: flex;
    overflow-x: auto;
  }

  .sidebar nav button {
    min-width: max-content;
  }

  .sidebar-status {
    display: none;
  }

  .content {
    padding: var(--space-6) var(--space-4) 56px;
  }
}
</style>
