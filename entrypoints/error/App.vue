<script setup lang="ts">
import { ExternalLink, RotateCw, Server, Settings, ShieldX } from '@lucide/vue'
import { onMounted, shallowRef } from 'vue'

import type { ErrorPageContext } from '../../src/application/errors/error-correlation-store'
import { t } from '../../src/i18n/messages'
import { errorText } from '../../src/ui/labels'
import { applyAppearance } from '../../src/ui/theme/accents'
import { runtimeClient } from '../../src/ui/runtime/client'

const context = shallowRef<ErrorPageContext | null>(null)
const loading = shallowRef(true)
const error = shallowRef('')
const busy = shallowRef(false)

const token = (): string => new URLSearchParams(location.search).get('token') ?? ''

const load = async (): Promise<void> => {
  const [contextResult, stateResult] = await Promise.all([
    runtimeClient.errorContext(token()),
    runtimeClient.getState(),
  ])
  loading.value = false
  if (stateResult.ok) {
    applyAppearance(document.documentElement, stateResult.value.config.appearance)
  }
  if (!contextResult.ok) {
    error.value =
      contextResult.error.code === 'CONTEXT_EXPIRED'
        ? t('errorContextExpired')
        : t('noSafeErrorContext')
    return
  }
  context.value = contextResult.value
}

const recover = async (directOnce: boolean): Promise<void> => {
  if (busy.value) return
  busy.value = true
  const result = await runtimeClient.command<null>({
    token: token(),
    type: directOnce ? 'DIRECT_ONCE_FROM_ERROR' : 'RETRY_ERROR',
  })
  busy.value = false
  if (!result.ok) error.value = errorText(result.error)
}

const openSettings = async (section?: string): Promise<void> => {
  await runtimeClient.command({
    ...(section === undefined ? {} : { section }),
    type: 'OPEN_SETTINGS',
  })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="error-page">
    <article class="surface error-card">
      <span class="symbol" aria-hidden="true">
        <ShieldX :size="24" />
      </span>
      <p class="eyebrow">
        {{ t('bestEffortRecovery') }}
      </p>
      <h1>{{ t('errorTitle') }}</h1>

      <div v-if="loading" role="status">
        {{ t('loadingSafeErrorDetails') }}
      </div>
      <template v-else-if="context">
        <p>
          {{ t('proxyFailureBeforeHost') }}
          <a
            class="target-link"
            :href="context.displayUrl"
            :aria-disabled="busy"
            @click.prevent="recover(false)"
          >
            {{ context.displayUrl }} </a
          >.
          {{ t('proxyFailureAfterHost') }}
        </p>
        <dl>
          <div>
            <dt>{{ t('technicalCode') }}</dt>
            <dd>{{ context.technicalCode }}</dd>
          </div>
          <div>
            <dt>{{ t('proxyProfile') }}</dt>
            <dd>{{ context.profileName ?? t('unavailable') }}</dd>
          </div>
          <div>
            <dt>{{ t('matchedRule') }}</dt>
            <dd>{{ context.ruleName ?? t('globalRouteFallback') }}</dd>
          </div>
          <div>
            <dt>{{ t('occurred') }}</dt>
            <dd>{{ new Date(context.occurredAt).toLocaleString() }}</dd>
          </div>
        </dl>
        <p v-if="context.platform === 'CHROMIUM'" class="notice">
          {{ t('chromiumDirectOnceWarning') }}
        </p>
        <div class="actions">
          <button class="primary" type="button" :disabled="busy" @click="recover(false)">
            <RotateCw :size="16" aria-hidden="true" />
            {{ t('retry') }}
          </button>
          <button type="button" :disabled="busy" @click="openSettings('proxies')">
            <Server :size="16" aria-hidden="true" />
            {{ t('switchProxy') }}
          </button>
          <button type="button" :disabled="busy" @click="recover(true)">
            <ExternalLink :size="16" aria-hidden="true" />
            {{ t('openDirectlyOnce') }}
          </button>
          <button type="button" @click="openSettings()">
            <Settings :size="16" aria-hidden="true" />
            {{ t('openSettings') }}
          </button>
        </div>
      </template>
      <div v-else class="stack">
        <p>{{ error }}</p>
        <button type="button" @click="openSettings()">
          {{ t('openSettings') }}
        </button>
      </div>
      <p v-if="context && error" class="notice danger" role="alert">
        {{ error }}
      </p>
    </article>
  </main>
</template>

<style scoped>
.error-page {
  display: grid;
  min-height: 100vh;
  padding: 32px;
  place-items: center;
}

.error-card {
  display: grid;
  gap: 14px;
  width: min(100%, 650px);
  padding: 32px;
}

.symbol {
  display: grid;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--color-danger);
  background: var(--color-danger-soft);
  place-items: center;
}

h1 {
  margin-bottom: 0;
  font-size: clamp(28px, 5vw, 42px);
  letter-spacing: -0.035em;
}

dl {
  margin: 0;
}

dl div {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 11px 0;
  border-bottom: 1px solid var(--color-border);
}

dt {
  color: var(--color-muted);
}

dd {
  margin: 0;
  text-align: right;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.target-link {
  color: var(--color-primary);
  font-weight: 700;
  overflow-wrap: anywhere;
  text-underline-offset: 2px;
}

.target-link[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.52;
}
</style>
