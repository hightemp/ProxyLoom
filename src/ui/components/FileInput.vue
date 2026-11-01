<script setup lang="ts">
import { FileUp } from '@lucide/vue'
import { shallowRef, useId } from 'vue'

import { t } from '../../i18n/messages'

defineProps<{ accept: string; label: string; name?: string }>()
const emit = defineEmits<{ file: [file: File] }>()

const input = shallowRef<HTMLInputElement | null>(null)
const fileName = shallowRef('')
const dragging = shallowRef(false)
const labelId = useId()

const choose = (file: File | undefined): void => {
  if (file === undefined) return
  fileName.value = file.name
  emit('file', file)
}

const onChange = (event: Event): void => {
  const target = event.target as HTMLInputElement
  choose(target.files?.[0])
  target.value = ''
}

const onDrop = (event: DragEvent): void => {
  dragging.value = false
  choose(event.dataTransfer?.files?.[0])
}
</script>

<template>
  <div
    class="file-drop"
    :class="{ dragging }"
    role="group"
    :aria-labelledby="labelId"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <FileUp :size="20" aria-hidden="true" />
    <div class="file-text">
      <strong :id="labelId">{{ label }}</strong>
      <small class="truncate">{{ fileName || t('dropFileHint') }}</small>
    </div>
    <button type="button" class="small" @click="input?.click()">
      {{ t('chooseFile') }}
    </button>
    <input
      ref="input"
      class="sr-only"
      type="file"
      tabindex="-1"
      aria-hidden="true"
      :accept="accept"
      :name="name"
      @change="onChange"
    />
  </div>
</template>

<style scoped>
.file-drop {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius);
  color: var(--color-muted);
  background: var(--color-surface-2);
}

.file-drop.dragging {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.file-text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.file-text strong {
  color: var(--color-text);
  font-size: 13.5px;
  font-weight: 550;
}
</style>
