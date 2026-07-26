<script setup lang="ts">
import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import { t } from '../../i18n/messages'

defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()
const themeLabels = {
  DARK: t('themeDark'),
  LIGHT: t('themeLight'),
  SYSTEM: t('themeSystem'),
} as const
</script>

<template>
  <article class="surface card stack">
    <div>
      <p class="eyebrow">
        {{ t('appearanceEyebrow') }}
      </p>
      <h2>{{ t('appearanceTitle') }}</h2>
      <p>{{ t('appearanceDescription') }}</p>
    </div>
    <fieldset class="theme-grid" :disabled="busy">
      <legend>{{ t('theme') }}</legend>
      <button
        v-for="theme in ['SYSTEM', 'LIGHT', 'DARK'] as const"
        :key="theme"
        type="button"
        :aria-pressed="state.config.appearance.theme === theme"
        @click="
          emit('command', {
            appearance: { theme },
            type: 'UPDATE_APPEARANCE',
          })
        "
      >
        <span class="theme-preview" :class="theme.toLocaleLowerCase()" />
        {{ themeLabels[theme] }}
      </button>
    </fieldset>
  </article>
</template>
