<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { shallowRef } from 'vue'

import { t } from '../../i18n/messages'

defineProps<{ modelValue: string; label: string; autocomplete?: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const revealed = shallowRef(false)
</script>

<template>
  <label>
    {{ label }}
    <span class="password-control">
      <input
        :value="modelValue"
        :type="revealed ? 'text' : 'password'"
        :autocomplete="autocomplete ?? 'new-password'"
        spellcheck="false"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="ghost icon-button small"
        :aria-label="revealed ? t('hidePassword') : t('showPassword')"
        :title="revealed ? t('hidePassword') : t('showPassword')"
        :aria-pressed="revealed ? 'true' : 'false'"
        @click.prevent="revealed = !revealed"
      >
        <EyeOff v-if="revealed" :size="16" aria-hidden="true" />
        <Eye v-else :size="16" aria-hidden="true" />
      </button>
    </span>
  </label>
</template>

<style scoped>
.password-control {
  position: relative;
  display: block;
}

.password-control input {
  padding-right: 40px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 400;
}

.password-control button {
  position: absolute;
  top: 3px;
  right: 3px;
}
</style>
