<script setup lang="ts">
import { browser } from 'wxt/browser'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../src/application/runtime/contracts'
import type { LogQuery } from '../../src/application/logging/log-types'
import { t } from '../../src/i18n/messages'
import AppearanceSection from '../../src/ui/options/AppearanceSection.vue'
import DiagnosticsSection from '../../src/ui/options/DiagnosticsSection.vue'
import GeneralSection from '../../src/ui/options/GeneralSection.vue'
import ImportExportSection from '../../src/ui/options/ImportExportSection.vue'
import LogsSection from '../../src/ui/options/LogsSection.vue'
import ProfilesSection from '../../src/ui/options/ProfilesSection.vue'
import RulesSection from '../../src/ui/options/RulesSection.vue'
import { runtimeClient } from '../../src/ui/runtime/client'

type SectionId = 'general' | 'proxies' | 'rules' | 'logs' | 'import-export' | 'appearance' | 'about'

const sections: readonly {
  readonly id: SectionId
  readonly label: string
  readonly eyebrow: string
}[] = [
  { eyebrow: t('sectionGeneralEyebrow'), id: 'general', label: t('sectionGeneral') },
  { eyebrow: t('sectionProxiesEyebrow'), id: 'proxies', label: t('sectionProxies') },
  { eyebrow: t('sectionRulesEyebrow'), id: 'rules', label: t('sectionRules') },
  { eyebrow: t('sectionLogsEyebrow'), id: 'logs', label: t('sectionLogs') },
  {
    eyebrow: t('sectionImportExportEyebrow'),
    id: 'import-export',
    label: t('sectionImportExport'),
  },
  {
    eyebrow: t('sectionAppearanceEyebrow'),
    id: 'appearance',
    label: t('appearanceTitle'),
  },
  { eyebrow: t('sectionAboutEyebrow'), id: 'about', label: t('diagnosticsTitle') },
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
  document.documentElement.dataset.theme = next.config.appearance.theme.toLocaleLowerCase('en-US')
}

const setStatus = (value: string, error = false): void => {
  message.value = value
  messageIsError.value = error
}

const load = async (logQuery?: LogQuery): Promise<void> => {
  const result = await runtimeClient.getState(logQuery)
  loading.value = false
  if (!result.ok) {
    setStatus(`${result.error.code}: ${result.error.message}`, true)
    return
  }
  state.value = result.value
  applyTheme(result.value)
}

const execute = async (request: RuntimeRequest): Promise<void> => {
  busy.value = true
  message.value = ''
  const result = await runtimeClient.command<unknown>(request)
  busy.value = false
  if (!result.ok) {
    setStatus(`${result.error.code}: ${result.error.message}`, true)
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
        <span class="brand-mark" aria-hidden="true">{{ t('extensionAbbreviation') }}</span>
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
          <span>{{ section.label }}</span>
          <small>{{ section.eyebrow }}</small>
        </button>
      </nav>
      <div v-if="state" class="sidebar-status">
        <span class="status-dot" :class="{ danger: state.diagnostics.lastApplyError !== null }" />
        <span class="sr-only">
          {{
            state.diagnostics.lastApplyError === null
              ? t('applyStatusHealthy')
              : t('applyStatusFailed')
          }}
        </span>
        <span>
          <strong>{{ state.config.general.mode }}</strong>
          <small>{{ t('revision') }} {{ state.config.revision }}</small>
        </span>
      </div>
    </aside>

    <main id="settings-content" class="content" tabindex="-1">
      <header class="page-header">
        <div>
          <p class="eyebrow">
            {{ selectedMeta.eyebrow }}
          </p>
          <h1>{{ selectedMeta.label }}</h1>
        </div>
        <span v-if="busy" class="status-pill" role="status"> {{ t('applying') }} </span>
      </header>

      <p
        v-if="message"
        class="toast"
        :class="{ danger: messageIsError }"
        :role="messageIsError ? 'alert' : 'status'"
      >
        {{ message }}
      </p>

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
        />
        <RulesSection
          v-else-if="selected === 'rules'"
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
  </div>
</template>

<style scoped>
.settings-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 980px);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 28px;
  height: 100vh;
  padding: 24px 18px;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.brand,
.sidebar-status {
  display: flex;
  gap: 11px;
  align-items: center;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: white;
  background: linear-gradient(135deg, var(--color-primary), #7a5af8);
  font-size: 12px;
  font-weight: 800;
  place-items: center;
}

.brand div,
.sidebar-status span:last-child {
  display: grid;
  gap: 2px;
}

.brand small,
.sidebar-status small {
  color: var(--color-muted);
}

nav {
  display: grid;
  align-content: start;
  gap: 4px;
}

nav button {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  color: var(--color-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

nav button small {
  opacity: 0.75;
}

nav button[aria-current='page'] {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-success);
}

.status-dot.danger {
  background: var(--color-danger);
}

.content {
  display: grid;
  align-content: start;
  gap: 20px;
  padding: 38px 44px 80px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  min-height: 68px;
}

.page-header h1 {
  margin: 2px 0 0;
  font-size: clamp(28px, 4vw, 38px);
  letter-spacing: -0.035em;
}

.toast {
  position: sticky;
  z-index: 5;
  top: 12px;
  margin: 0;
  padding: 11px 14px;
  border: 1px solid var(--color-success);
  border-radius: 10px;
  color: var(--color-success-strong);
  background: var(--color-success-soft);
}

.toast.danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

@media (max-width: 760px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    z-index: 10;
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
    padding: 24px 16px 56px;
  }
}
</style>
