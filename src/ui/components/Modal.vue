<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, shallowRef, useId, watch } from 'vue'

import { t } from '../../i18n/messages'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{ open: boolean; title: string; size?: 'medium' | 'large' }>(),
  { size: 'medium' },
)
const emit = defineEmits<{ close: [] }>()

const dialog = shallowRef<HTMLDialogElement | null>(null)
const titleId = useId()

// Open right after the DOM patch so a later nextTick focus by the parent (e.g. the first field)
// is not overridden by the dialog's own initial focus.
const openDialog = (): void => {
  const element = dialog.value
  if (!props.open || element === null || element.open) return
  if (typeof element.showModal === 'function') element.showModal()
  else element.setAttribute('open', '')
}

onMounted(openDialog)
watch(() => props.open, openDialog, { flush: 'post' })

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <dialog
    v-if="open"
    ref="dialog"
    class="modal"
    :class="size"
    aria-modal="true"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @keydown="onKeydown"
  >
    <header class="modal-header">
      <h2 :id="titleId">
        {{ title }}
      </h2>
      <IconButton :icon="X" :label="t('close')" @click="emit('close')" />
    </header>
    <div class="modal-body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="modal-footer">
      <slot name="footer" />
    </footer>
  </dialog>
</template>

<style scoped>
.modal {
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 32px));
  max-height: min(860px, calc(100vh - 48px));
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.modal.large {
  width: min(840px, calc(100vw - 32px));
}

.modal::backdrop {
  background: rgb(10 14 22 / 50%);
}

.modal-header {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.modal-body {
  flex: 1;
  min-height: 0;
  padding: var(--space-5);
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-2);
}
</style>
