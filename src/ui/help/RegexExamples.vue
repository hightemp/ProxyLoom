<script setup lang="ts">
import { t, type MessageKey } from '../../i18n/messages'

/** Patterns are regular-expression syntax and stay untranslated; descriptions are localized. */
const EXAMPLES: readonly { readonly pattern: string; readonly meaning: MessageKey }[] = [
  { meaning: 'regexExampleSite', pattern: '^https://example\\.com/$' },
  {
    meaning: 'regexExampleSubdomains',
    pattern: '^https://([a-z0-9-]+\\.)*example\\.com(?::\\d+)?/$',
  },
]
</script>

<template>
  <dl class="regex-examples">
    <template v-for="example in EXAMPLES" :key="example.pattern">
      <dt>
        <code>{{ example.pattern }}</code>
      </dt>
      <dd>{{ t(example.meaning) }}</dd>
    </template>
  </dl>
</template>

<style scoped>
.regex-examples {
  display: grid;
  gap: 2px;
  margin: 0;
}

.regex-examples dt code {
  overflow-wrap: anywhere;
  color: var(--color-primary);
  font-size: 12px;
}

.regex-examples dd {
  margin: 0 0 6px;
  color: var(--color-muted);
}
</style>
