<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

import type { ErrorContext } from '../../src/application/errors/error-correlation-store'
import { t } from '../../src/i18n/messages'
import { runtimeClient } from '../../src/ui/runtime/client'

const context = shallowRef<ErrorContext | null>(null)
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
    document.documentElement.dataset.theme =
      stateResult.value.config.appearance.theme.toLocaleLowerCase('en-US')
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
  busy.value = true
  const result = await runtimeClient.command<null>({
    token: token(),
    type: directOnce ? 'DIRECT_ONCE_FROM_ERROR' : 'RETRY_ERROR',
  })
  busy.value = false
  if (!result.ok) error.value = `${result.error.code}: ${result.error.message}`
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
      <span class="symbol" aria-hidden="true"> ! </span>
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
          <strong>{{ context.hostname }}</strong
          >. {{ t('proxyFailureAfterHost') }}
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
            {{ t('retry') }}
          </button>
          <button type="button" :disabled="busy" @click="openSettings('proxies')">
            {{ t('switchProxy') }}
          </button>
          <button type="button" :disabled="busy" @click="recover(true)">
            {{ t('openDirectlyOnce') }}
          </button>
          <button type="button" @click="openSettings()">
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
  color: white;
  background: var(--color-danger);
  font-size: 22px;
  font-weight: 800;
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
</style>
