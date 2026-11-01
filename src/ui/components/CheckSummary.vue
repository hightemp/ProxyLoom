<script setup lang="ts">
import { CircleCheck, CircleX } from '@lucide/vue'
import { computed } from 'vue'

import type { ProxyCheckResult } from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { countryDisplay } from '../flags/country'
import CountryFlag from './CountryFlag.vue'
import { checkErrorLabel } from '../labels'

const props = defineProps<{ result: ProxyCheckResult }>()

const country = computed(() =>
  props.result.country === null ? null : countryDisplay(props.result.country),
)
const countryTitle = computed(() =>
  country.value === null
    ? ''
    : country.value.code === null || country.value.code === country.value.name
      ? country.value.name
      : `${country.value.name} (${country.value.code})`,
)
</script>

<template>
  <div class="check-summary">
    <div class="check-line">
      <span class="badge" :class="result.availability ? 'success' : 'danger'">
        <CircleCheck v-if="result.availability" :size="12" aria-hidden="true" />
        <CircleX v-else :size="12" aria-hidden="true" />
        {{ result.availability ? t('available') : t('unavailable') }}
      </span>
      <span class="check-latency"
        >{{ Math.round(result.totalDurationMs) }} {{ t('millisecondsShort') }}</span
      >
    </div>
    <div v-if="result.availability" class="check-line details">
      <span v-if="country" class="check-country" :title="countryTitle">
        <CountryFlag v-if="country.code" :code="country.code" />
        {{ country.name }}
      </span>
      <code v-if="result.externalIp" class="check-ip">{{ result.externalIp }}</code>
    </div>
    <div v-else-if="result.errorCode" class="check-line details">
      <span class="check-error">{{ checkErrorLabel(result.errorCode) }}</span>
    </div>
  </div>
</template>

<style scoped>
.check-summary {
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
}

.check-line {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: center;
  min-width: 0;
}

.check-latency {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  font-weight: 550;
}

.details {
  color: var(--color-muted);
}

.check-country {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--color-text);
}

.check-ip {
  overflow-wrap: anywhere;
  font-size: 12px;
}

.check-error {
  color: var(--color-danger);
}
</style>
