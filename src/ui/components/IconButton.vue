<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    icon: Component
    /** Accessible name and tooltip; icon-only buttons are never unnamed. */
    label: string
    variant?: 'ghost' | 'default' | 'danger-text'
    size?: 'small' | 'default'
    disabled?: boolean
  }>(),
  { disabled: false, size: 'default', variant: 'ghost' },
)
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="[variant === 'default' ? '' : variant, size === 'small' ? 'small' : '']"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <component :is="icon" :size="16" aria-hidden="true" />
  </button>
</template>
