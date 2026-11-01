<script setup lang="ts">
import { CircleCheck, CircleMinus, CircleX } from '@lucide/vue'
import { computed } from 'vue'

import type { RegexTestRow } from '../../application/regex-tester/regex-batch-tester'
import { formatDecimal, t } from '../../i18n/messages'
import { errorText } from '../labels'

const props = defineProps<{
  rows: readonly RegexTestRow[]
  elapsedMs: number
}>()

const counts = computed(() => ({
  matched: props.rows.filter((row) => row.errorCode === null && row.matched === true).length,
  missed: props.rows.filter((row) => row.errorCode === null && row.matched === false).length,
}))

const verdict = (row: RegexTestRow): { readonly label: string; readonly tone: string } =>
  row.errorCode !== null
    ? { label: t('testError'), tone: 'danger' }
    : row.matched === true
      ? { label: t('match'), tone: 'success' }
      : { label: t('noMatch'), tone: 'neutral' }
</script>

<template>
  <div class="regex-results">
    <p class="test-summary">
      <strong>{{
        t('testSummary', [String(rows.length), String(counts.matched), String(counts.missed)])
      }}</strong>
      <span class="muted">{{ t('testElapsedLocal', formatDecimal(elapsedMs, 1)) }}</span>
    </p>
    <ul class="test-results">
      <li v-for="(row, index) in rows" :key="index" class="test-row">
        <span class="badge" :class="verdict(row).tone">
          <CircleCheck v-if="verdict(row).tone === 'success'" :size="12" aria-hidden="true" />
          <CircleX v-else-if="verdict(row).tone === 'danger'" :size="12" aria-hidden="true" />
          <CircleMinus v-else :size="12" aria-hidden="true" />
          {{ verdict(row).label }}
        </span>
        <span class="test-target">
          <code>{{ row.input }}</code>
          <small v-if="row.errorCode !== null" class="danger-text">
            {{ errorText({ code: row.errorCode }) }}
          </small>
          <small
            v-else-if="row.normalizedTarget !== null && row.normalizedTarget !== row.input"
            class="tested-as muted"
          >
            {{ t('testedAs') }} <code>{{ row.normalizedTarget }}</code>
          </small>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.regex-results {
  display: grid;
  gap: var(--space-2);
}

.test-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--space-3);
  align-items: baseline;
  margin: 0;
}

.test-results {
  display: grid;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  list-style: none;
}

.test-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  padding: 8px var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.test-row:last-child {
  border-bottom: 0;
}

.test-row .badge {
  justify-content: center;
}

.test-target {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.test-target > code {
  overflow-wrap: anywhere;
  font-size: 12.5px;
}

.tested-as code {
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
