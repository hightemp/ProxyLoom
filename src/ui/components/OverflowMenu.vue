<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue'
import { nextTick, onBeforeUnmount, shallowRef } from 'vue'

defineProps<{ label: string }>()

const open = shallowRef(false)
const placement = shallowRef<Record<string, string>>({})
const VIEWPORT_MARGIN = 8
const GAP = 4

// Fixed to the viewport so lists with overflow clipping cannot cut the menu off; it opens
// upwards when the space below the trigger is too small.
const place = (): void => {
  const anchor = trigger.value?.getBoundingClientRect()
  const size = menu.value?.getBoundingClientRect()
  if (anchor === undefined || size === undefined) return
  const below = anchor.bottom + GAP
  const above = anchor.top - GAP - size.height
  const top =
    below + size.height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
      ? above
      : below
  placement.value = {
    position: 'fixed',
    right: `${Math.max(VIEWPORT_MARGIN, window.innerWidth - anchor.right)}px`,
    top: `${top}px`,
  }
}

const closeOnViewportChange = (): void => close(false)
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
  window.removeEventListener('scroll', closeOnViewportChange, true)
  window.removeEventListener('resize', closeOnViewportChange)
  if (restoreFocus) trigger.value?.focus()
}

const toggle = async (): Promise<void> => {
  if (open.value) {
    close()
    return
  }
  open.value = true
  placement.value = { position: 'fixed', visibility: 'hidden' }
  document.addEventListener('pointerdown', onDocumentPointer)
  window.addEventListener('scroll', closeOnViewportChange, true)
  window.addEventListener('resize', closeOnViewportChange)
  await nextTick()
  place()
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

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  window.removeEventListener('scroll', closeOnViewportChange, true)
  window.removeEventListener('resize', closeOnViewportChange)
})
</script>

<template>
  <span class="overflow-menu">
    <button
      ref="trigger"
      class="overflow-trigger ghost icon-button"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-label="label"
      @click="void toggle()"
    >
      <MoreHorizontal :size="16" aria-hidden="true" />
    </button>
    <div
      v-if="open"
      ref="menu"
      class="overflow-items"
      role="menu"
      :style="placement"
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

.overflow-items {
  z-index: 30;
  display: grid;
  min-width: 240px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 24%);
}

.overflow-items :slotted([role='menuitem']) {
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  box-shadow: none;
  font-weight: 450;
  text-align: left;
}

.overflow-items :slotted([role='menuitem']:hover),
.overflow-items :slotted([role='menuitem']:focus-visible) {
  background: var(--color-primary-soft);
}
</style>
