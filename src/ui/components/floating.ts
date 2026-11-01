const VIEWPORT_MARGIN = 8
const GAP = 4

/**
 * Viewport-fixed placement for menus and popovers: below the anchor, or above it when the space
 * below is too small. Fixed positioning keeps them clear of scrolling and clipping containers.
 */
export const placeFloating = (
  anchor: DOMRect,
  size: DOMRect,
  align: 'start' | 'end' = 'end',
): Record<string, string> => {
  const below = anchor.bottom + GAP
  const above = anchor.top - GAP - size.height
  const preferred =
    below + size.height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
      ? above
      : below
  // When neither side has room, keep the whole box on screen instead of overflowing the viewport.
  const top = Math.max(
    VIEWPORT_MARGIN,
    Math.min(preferred, window.innerHeight - size.height - VIEWPORT_MARGIN),
  )
  const horizontal =
    align === 'end'
      ? { right: `${Math.max(VIEWPORT_MARGIN, window.innerWidth - anchor.right)}px` }
      : {
          left: `${Math.max(
            VIEWPORT_MARGIN,
            Math.min(anchor.left, window.innerWidth - size.width - VIEWPORT_MARGIN),
          )}px`,
        }
  return { position: 'fixed', top: `${top}px`, ...horizontal }
}
