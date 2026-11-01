<script setup lang="ts">
import { nextTick, onBeforeUnmount, shallowRef } from 'vue'

/** Decorative glyph; the button is named by aria-label. */
const MENU_GLYPH = '⋯'

defineProps<{ label: string }>()

const open = shallowRef(false)
const trigger = shallowRef<HTMLButtonElement | null>(null)
const menu = shallowRef<HTMLElement | null>(null)

const items = (): HTMLElement[] =>
  [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
    (item) => !item.hasAttribute('disabled'),
  )

const onDocumentPointer = (event: PointerEvent): void => {
  const target = event.target as Node | null
  if (target !== null && !menu.value?.contains(target) && !trigger.value?.contains(target)) {
    close(false)
  }
}

const close = (restoreFocus = true): void => {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onDocumentPointer)
  if (restoreFocus) trigger.value?.focus()
}

const toggle = async (): Promise<void> => {
  if (open.value) {
    close()
    return
  }
  open.value = true
  document.addEventListener('pointerdown', onDocumentPointer)
  await nextTick()
  items()[0]?.focus()
}

const onKeydown = (event: KeyboardEvent): void => {
  const list = items()
  const index = list.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    list[(index + step + list.length) % list.length]?.focus()
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    ;(event.key === 'Home' ? list[0] : list.at(-1))?.focus()
  } else if (event.key === 'Tab') {
    close(false)
  }
}

const onClick = (event: MouseEvent): void => {
  if ((event.target as HTMLElement).closest('[role="menuitem"]') !== null) close()
}

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer))
</script>

<template>
  <span class="overflow-menu">
    <button
      ref="trigger"
      class="overflow-trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-label="label"
      @click="void toggle()"
    >
      <span aria-hidden="true">{{ MENU_GLYPH }}</span>
    </button>
    <div
      v-if="open"
      ref="menu"
      class="overflow-items"
      role="menu"
      :aria-label="label"
      @keydown="onKeydown"
      @click="onClick"
    >
      <slot />
    </div>
  </span>
</template>

<style scoped>
.overflow-menu {
  position: relative;
  display: inline-block;
}

.overflow-trigger {
  min-width: 36px;
  font-size: 18px;
  line-height: 1;
}

.overflow-items {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 10;
  display: grid;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 24%);
}

.overflow-items :slotted([role='menuitem']) {
  width: 100%;
  min-height: 32px;
  border: 0;
  background: transparent;
  text-align: left;
}

.overflow-items :slotted([role='menuitem']:hover),
.overflow-items :slotted([role='menuitem']:focus-visible) {
  background: var(--color-primary-soft);
}
</style>
