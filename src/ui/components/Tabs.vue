<script setup lang="ts">
import { nextTick, shallowRef, useId, type Component } from 'vue'

const props = defineProps<{
  label: string
  tabs: readonly { readonly id: string; readonly label: string; readonly icon?: Component }[]
}>()

const active = shallowRef(props.tabs[0]?.id ?? '')
const baseId = useId()
const tabId = (id: string): string => `${baseId}-tab-${id}`
const panelId = (id: string): string => `${baseId}-panel-${id}`

const select = async (id: string, focus = false): Promise<void> => {
  active.value = id
  if (!focus) return
  await nextTick()
  document.getElementById(tabId(id))?.focus()
}

const onKeydown = (event: KeyboardEvent): void => {
  const index = props.tabs.findIndex((tab) => tab.id === active.value)
  const count = props.tabs.length
  const target =
    event.key === 'ArrowRight'
      ? (index + 1) % count
      : event.key === 'ArrowLeft'
        ? (index - 1 + count) % count
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? count - 1
            : null
  if (target === null) return
  event.preventDefault()
  void select(props.tabs[target]!.id, true)
}

// A required field on a hidden tab would block submission without any visible error.
const onInvalid = (event: Event): void => {
  const panel = (event.target as HTMLElement).closest<HTMLElement>('[role="tabpanel"]')
  const id = panel?.dataset.tab
  if (id !== undefined && id !== active.value) active.value = id
}
</script>

<template>
  <div class="tabs" @invalid.capture="onInvalid">
    <div class="tab-list" role="tablist" :aria-label="label" @keydown="onKeydown">
      <button
        v-for="tab in tabs"
        :id="tabId(tab.id)"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="active === tab.id ? 'true' : 'false'"
        :aria-controls="panelId(tab.id)"
        :tabindex="active === tab.id ? 0 : -1"
        @click="select(tab.id)"
      >
        <component :is="tab.icon" v-if="tab.icon" :size="16" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </div>
    <div
      v-for="tab in tabs"
      v-show="active === tab.id"
      :id="panelId(tab.id)"
      :key="tab.id"
      class="tab-panel"
      role="tabpanel"
      :data-tab="tab.id"
      :aria-labelledby="tabId(tab.id)"
      tabindex="0"
    >
      <slot :name="tab.id" />
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: grid;
  gap: var(--space-4);
}

.tab-list {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.tab-list button {
  margin-bottom: -1px;
  padding: 0 var(--space-3);
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  color: var(--color-muted);
  background: transparent;
  box-shadow: none;
}

.tab-list button:hover:not(:disabled) {
  border-color: transparent;
  border-bottom-color: var(--color-border-strong);
  color: var(--color-text);
  background: transparent;
}

.tab-list button[aria-selected='true'] {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.tab-panel:focus-visible {
  border-radius: var(--radius);
}
</style>
