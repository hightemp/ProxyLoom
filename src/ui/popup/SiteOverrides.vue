<script setup lang="ts">
import { Pin, Trash2 } from '@lucide/vue'
import { computed } from 'vue'

import { overridesForSite } from '../../application/overrides/site-overrides'
import type { RuntimeRequest } from '../../application/runtime/contracts'
import { asProxyProfileId } from '../../domain/types/brand'
import type { ProxyProfile, RuleAction, TemporaryOverride } from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { confirmController } from '../confirm/confirm-controller'
import { decisionActionLabel } from '../labels'

const props = defineProps<{
  overrides: readonly TemporaryOverride[]
  hostname: string
  activeTabId: number | null
  profiles: readonly ProxyProfile[]
  busy: boolean
  tabId?: number | undefined
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()

const PROFILE_PREFIX = 'PROFILE:'

const siteOverrides = computed(() => overridesForSite(props.overrides, props.hostname))
const context = computed(() => (props.tabId === undefined ? {} : { tabId: props.tabId }))

const routeValue = (action: RuleAction): string =>
  action.type === 'PROXY' && action.targetProxyProfileId !== null
    ? `${PROFILE_PREFIX}${action.targetProxyProfileId}`
    : 'DIRECT'

const changeRoute = (override: TemporaryOverride, value: string): void => {
  const action: RuleAction =
    value === 'DIRECT'
      ? { targetProxyProfileId: null, type: 'DIRECT' }
      : {
          targetProxyProfileId: asProxyProfileId(value.slice(PROFILE_PREFIX.length)),
          type: 'PROXY',
        }
  emit('command', { action, overrideId: override.id, ...context.value, type: 'UPDATE_OVERRIDE' })
}

const promote = async (override: TemporaryOverride): Promise<void> => {
  const confirmed = await confirmController.request({
    code: override.generatedPattern,
    confirmLabel: t('makePermanent'),
    message: t('makePermanentMessage'),
    title: t('makePermanentTitle'),
  })
  if (confirmed) {
    emit('command', { overrideId: override.id, ...context.value, type: 'PROMOTE_OVERRIDE' })
  }
}
</script>

<template>
  <section
    v-if="siteOverrides.length > 0"
    class="site-overrides"
    :aria-label="t('activeForThisSite')"
  >
    <span class="eyebrow">{{ t('activeForThisSite') }}</span>
    <ul>
      <li v-for="override in siteOverrides" :key="override.id">
        <div class="override-heading">
          <code>{{ override.originKey }}</code>
          <small>
            {{ override.scope === 'EXACT_HOSTNAME' ? t('exactHostname') : t('domainSubdomains') }}
            <template v-if="override.sourceTabId !== activeTabId">
              · {{ t('fromAnotherTab') }}
            </template>
          </small>
        </div>
        <select
          :value="routeValue(override.action)"
          :disabled="busy"
          :aria-label="t('routeFor', override.originKey)"
          @change="changeRoute(override, ($event.target as HTMLSelectElement).value)"
        >
          <option value="DIRECT">
            {{ decisionActionLabel('DIRECT') }}
          </option>
          <option
            v-for="profile in profiles"
            :key="profile.id"
            :value="`${PROFILE_PREFIX}${profile.id}`"
          >
            {{ profile.name }} ({{ profile.shortName ?? profile.generatedShortName }})
          </option>
        </select>
        <div class="button-row">
          <button type="button" class="small" :disabled="busy" @click="void promote(override)">
            <Pin :size="14" aria-hidden="true" />
            {{ t('makePermanent') }}
          </button>
          <button
            class="danger-text small"
            type="button"
            :disabled="busy"
            @click="
              emit('command', { overrideId: override.id, ...context, type: 'REMOVE_OVERRIDE' })
            "
          >
            <Trash2 :size="14" aria-hidden="true" />
            {{ t('remove') }}
          </button>
        </div>
      </li>
    </ul>
    <button
      class="link-button"
      type="button"
      @click="emit('command', { section: 'overrides', type: 'OPEN_SETTINGS' })"
    >
      {{ t('manageAllOverrides') }}
    </button>
  </section>
</template>

<style scoped>
.site-overrides {
  display: grid;
  gap: 8px;
}

ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.override-heading {
  display: grid;
  gap: 2px;
}

.override-heading small {
  color: var(--color-muted);
}

code {
  word-break: break-all;
}
</style>
