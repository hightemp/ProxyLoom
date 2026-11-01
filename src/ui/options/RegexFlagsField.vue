<script setup lang="ts">
import { t } from '../../i18n/messages'
import HelpTip from '../components/HelpTip.vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/** Flag letters are regular-expression syntax; their order is kept canonical. */
const FLAGS = [
  { hint: 'flagIgnoreCaseHint', label: 'flagIgnoreCase', letter: 'i' },
  { hint: 'flagMultilineHint', label: 'flagMultiline', letter: 'm' },
] as const

const toggle = (letter: string, on: boolean): void => {
  const next = new Set(props.modelValue.split(''))
  if (on) next.add(letter)
  else next.delete(letter)
  emit(
    'update:modelValue',
    FLAGS.map((flag) => flag.letter)
      .filter((l) => next.has(l))
      .join(''),
  )
}
</script>

<template>
  <fieldset class="flags-field">
    <legend class="field-label">
      {{ t('flags') }}
      <HelpTip :text="t('tipFlags')" article="regex" />
    </legend>
    <label v-for="flag in FLAGS" :key="flag.letter" class="check-row" :title="t(flag.hint)">
      <input
        type="checkbox"
        :checked="modelValue.includes(flag.letter)"
        @change="toggle(flag.letter, ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t(flag.label) }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.flags-field {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  align-items: center;
  margin: 0;
  padding: 0;
  border: 0;
}

.flags-field legend {
  width: 100%;
  margin-bottom: 4px;
  padding: 0;
}

.flags-field .check-row {
  min-height: auto;
}
</style>
