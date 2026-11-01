<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { shallowRef, useId } from 'vue'

defineProps<{ title: string }>()

const open = shallowRef(false)
const regionId = useId()
const buttonId = useId()
</script>

<template>
  <div class="disclosure" :class="{ open }">
    <button
      :id="buttonId"
      type="button"
      class="disclosure-toggle ghost"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="regionId"
      @click="open = !open"
    >
      <ChevronRight :size="16" aria-hidden="true" class="chevron" />
      {{ title }}
    </button>
    <div
      v-if="open"
      :id="regionId"
      class="disclosure-body"
      role="region"
      :aria-labelledby="buttonId"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.disclosure {
  display: grid;
  gap: var(--space-2);
}

.disclosure-toggle {
  justify-self: start;
  padding: 0 var(--space-2);
  color: var(--color-muted);
  font-weight: 600;
}

.chevron {
  transition: transform 0.15s ease;
}

.open .chevron {
  transform: rotate(90deg);
}

.disclosure-body {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-2);
}
</style>
