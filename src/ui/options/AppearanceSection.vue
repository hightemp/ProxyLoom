<script setup lang="ts">
import { Check, Palette } from '@lucide/vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type { AppearanceAccent, AppearanceTheme } from '../../domain/types/entities'
import { t, type MessageKey } from '../../i18n/messages'
import { ACCENT_ORDER, ACCENTS } from '../theme/accents'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()

const THEMES: readonly { readonly id: AppearanceTheme; readonly label: MessageKey }[] = [
  { id: 'SYSTEM', label: 'themeSystem' },
  { id: 'LIGHT', label: 'themeLight' },
  { id: 'DARK', label: 'themeDark' },
]

const ACCENT_LABELS: Record<AppearanceAccent, MessageKey> = {
  AMBER: 'accentAmber',
  INDIGO: 'accentIndigo',
  ROSE: 'accentRose',
  SLATE: 'accentSlate',
  TEAL: 'accentTeal',
  VIOLET: 'accentViolet',
}

const update = (patch: Partial<{ theme: AppearanceTheme; accent: AppearanceAccent }>): void => {
  emit('command', {
    appearance: { ...props.state.config.appearance, ...patch },
    type: 'UPDATE_APPEARANCE',
  })
}
</script>

<template>
  <article class="surface card stack">
    <div class="card-heading">
      <Palette :size="20" aria-hidden="true" />
      <div>
        <h2>{{ t('appearanceTitle') }}</h2>
        <p>{{ t('appearanceDescription') }}</p>
      </div>
    </div>

    <fieldset class="choice-group" :disabled="busy">
      <legend>{{ t('theme') }}</legend>
      <div class="theme-options">
        <button
          v-for="theme in THEMES"
          :key="theme.id"
          type="button"
          class="theme-option"
          :aria-pressed="state.config.appearance.theme === theme.id ? 'true' : 'false'"
          @click="update({ theme: theme.id })"
        >
          <span class="theme-preview" :class="theme.id.toLocaleLowerCase()" aria-hidden="true">
            <span class="preview-window">
              <span class="preview-sidebar" />
              <span class="preview-content">
                <span class="preview-line accent" />
                <span class="preview-line" />
                <span class="preview-line short" />
              </span>
            </span>
          </span>
          <span class="option-label">
            <Check
              v-if="state.config.appearance.theme === theme.id"
              :size="14"
              aria-hidden="true"
            />
            {{ t(theme.label) }}
          </span>
        </button>
      </div>
    </fieldset>

    <fieldset class="choice-group" :disabled="busy">
      <legend>{{ t('accentColor') }}</legend>
      <p class="muted">
        {{ t('accentDescription') }}
      </p>
      <div class="accent-options">
        <button
          v-for="accent in ACCENT_ORDER"
          :key="accent"
          type="button"
          class="accent-option"
          :style="{ '--swatch': ACCENTS[accent].light.fill }"
          :aria-label="t(ACCENT_LABELS[accent])"
          :title="t(ACCENT_LABELS[accent])"
          :aria-pressed="state.config.appearance.accent === accent ? 'true' : 'false'"
          @click="update({ accent })"
        >
          <Check v-if="state.config.appearance.accent === accent" :size="16" aria-hidden="true" />
        </button>
      </div>
    </fieldset>
  </article>
</template>

<style scoped>
.choice-group {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.choice-group legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-weight: 600;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-3);
}

.theme-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2);
  justify-content: stretch;
  justify-items: stretch;
  height: auto;
  padding: var(--space-2);
  border-radius: var(--radius-lg);
}

.theme-option[aria-pressed='true'] {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.option-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding-bottom: 2px;
}

.theme-preview {
  display: block;
  overflow: hidden;
  height: 96px;
  border-radius: var(--radius);
  --p-bg: #f5f6f8;
  --p-surface: #ffffff;
  --p-line: #d6dbe4;
  --p-border: #e1e5ec;
}

.theme-preview.dark {
  --p-bg: #0f1218;
  --p-surface: #171b23;
  --p-line: #343c4b;
  --p-border: #2a303c;
}

.preview-window {
  display: grid;
  grid-template-columns: 30% 1fr;
  height: 100%;
  border: 1px solid var(--p-border);
  border-radius: var(--radius);
  background: var(--p-bg);
}

.theme-preview.system .preview-window {
  background: linear-gradient(115deg, #f5f6f8 50%, #0f1218 50%);
}

.preview-sidebar {
  border-right: 1px solid var(--p-border);
  background: var(--p-surface);
}

.theme-preview.system .preview-sidebar {
  background: #ffffff;
}

.preview-content {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 14px 12px;
}

.preview-line {
  height: 8px;
  border-radius: 4px;
  background: var(--p-line);
}

.theme-preview.system .preview-line {
  background: #8b93a3;
}

.theme-preview .preview-line.accent {
  width: 45%;
  background: var(--color-primary-fill);
}

.preview-line.short {
  width: 60%;
}

.accent-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.accent-option {
  width: 36px;
  min-height: 36px;
  height: 36px;
  padding: 0;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  color: #ffffff;
  background: var(--swatch);
  box-shadow: 0 0 0 1px var(--color-border);
}

.accent-option:hover:not(:disabled) {
  border-color: var(--color-surface);
  background: var(--swatch);
  filter: brightness(1.08);
}

.accent-option[aria-pressed='true'] {
  box-shadow: 0 0 0 2px var(--color-text);
}
</style>
