<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import type { AppRuntimeState } from '../../application/runtime/contracts'
import { t } from '../../i18n/messages'

const props = defineProps<{
  state: AppRuntimeState
}>()

const copied = shallowRef(false)
const safeDiagnostics = computed(() => ({
  appVersion: props.state.diagnostics.appVersion,
  appliedRevision: props.state.diagnostics.appliedRevision,
  appliedSnapshotHash: props.state.diagnostics.appliedSnapshotHash,
  capabilities: props.state.diagnostics.capabilities,
  controlStatus: props.state.diagnostics.controlStatus,
  incognitoAllowed: props.state.diagnostics.incognitoAllowed,
  lastApplyError: props.state.diagnostics.lastApplyError,
  persistedRevision: props.state.diagnostics.persistedRevision,
  platform: props.state.diagnostics.platform,
  schemaVersion: props.state.diagnostics.schemaVersion,
}))

const copy = async (): Promise<void> => {
  await navigator.clipboard.writeText(JSON.stringify(safeDiagnostics.value, null, 2))
  copied.value = true
}
</script>

<template>
  <div class="stack">
    <article class="surface card stack">
      <div>
        <p class="eyebrow">
          {{ t('diagnosticsEyebrow') }}
        </p>
        <h2>{{ t('diagnosticsTitle') }}</h2>
        <p>{{ t('diagnosticsPrivacy') }}</p>
      </div>
      <dl class="diagnostics-grid">
        <div>
          <dt>{{ t('version') }}</dt>
          <dd>{{ state.diagnostics.appVersion }}</dd>
        </div>
        <div>
          <dt>{{ t('platform') }}</dt>
          <dd>{{ state.diagnostics.platform }}</dd>
        </div>
        <div>
          <dt>{{ t('control') }}</dt>
          <dd>{{ state.diagnostics.controlStatus.replaceAll('_', ' ') }}</dd>
        </div>
        <div>
          <dt>{{ t('schema') }}</dt>
          <dd>{{ state.diagnostics.schemaVersion }}</dd>
        </div>
        <div>
          <dt>{{ t('persistedRevision') }}</dt>
          <dd>{{ state.diagnostics.persistedRevision }}</dd>
        </div>
        <div>
          <dt>{{ t('appliedRevision') }}</dt>
          <dd>{{ state.diagnostics.appliedRevision ?? t('notApplied') }}</dd>
        </div>
        <div>
          <dt>{{ t('fullUrlRules') }}</dt>
          <dd>
            {{ state.diagnostics.capabilities.fullUrlRules ? t('supported') : t('firefoxOnly') }}
          </dd>
        </div>
        <div>
          <dt>{{ t('tabSpecificOverrides') }}</dt>
          <dd>
            {{
              state.diagnostics.capabilities.tabSpecificOverrides
                ? t('supported')
                : t('originScopedCompatibility')
            }}
          </dd>
        </div>
      </dl>
      <p v-if="state.diagnostics.lastApplyError" class="notice danger">
        {{ t('lastApplyError') }} {{ state.diagnostics.lastApplyError }}
      </p>
      <button type="button" @click="copy">
        {{ copied ? t('copiedSafeDiagnostics') : t('copySafeDiagnostics') }}
      </button>
    </article>

    <article class="surface card">
      <h3>{{ t('knownPlatformBoundaries') }}</h3>
      <ul>
        <li>{{ t('boundaryFullUrl') }}</li>
        <li>{{ t('boundaryChromiumOnce') }}</li>
        <li>{{ t('boundaryErrorPage') }}</li>
        <li>{{ t('boundaryFailClosed') }}</li>
        <li>{{ t('boundaryWebSocket') }}</li>
      </ul>
    </article>
  </div>
</template>
