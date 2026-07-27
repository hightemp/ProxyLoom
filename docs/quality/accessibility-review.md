# Accessibility review

Date: 2026-07-27
Target: Chromium extension surfaces plus Orca 46.1 on Linux.

Automated checks pass for:

- accessible names on native controls across every Options section and Popup;
- one page heading and native semantic controls;
- keyboard entry into profile/rule editors and focus restoration to the activating button;
- keyboard move-up/move-down alternative to drag-and-drop;
- visible `:focus-visible` styling;
- light/dark semantic text-token contrast of at least 4.5:1;
- text/non-color cues for routing and apply state;
- reduced-motion override;
- Popup keeps a 390 CSS-pixel intrinsic action-surface width even from Chromium's narrow bootstrap
  measurement viewport, fits without document-level overflow at that width and remains within the
  action-surface budget at 200% zoom; Options reflows at 640 CSS pixels;
- actual browser tab zoom set to 200% through `chrome.tabs.setZoom`, including navigation to About
  and a document-overflow check.

Evidence: `tests/e2e/accessibility.spec.ts` plus core keyboard reorder coverage.

## Screen-reader walkthrough

Orca 46.1 was run with speech enabled against headed Chromium in a separate Xvfb display, DBus
session and AT-SPI registry. Chromium used `--force-renderer-accessibility`; no user desktop
application was present in that session.

A keyboard-only Tab walkthrough focused all seven Options navigation buttons without a pointer.
Orca emitted speech output for:

1. `General Routing policy push button`
2. `Proxies Endpoints push button`
3. `Rules Priority push button`
4. `Logs Local only push button`
5. `Import & Export Portable data push button`
6. `Appearance Theme push button`
7. `About / Diagnostics Support push button`

Orca also announced the ProxyLoom Settings page, its landmark/heading/form summary and the loading
live region. The isolated log passed the privacy-canary scan and was deleted after this aggregate
evidence was recorded.

The first headed screen-reader run exposed a narrow-Popup horizontal overflow hidden by overlay
scrollbars in headless mode. Replacing `100vw` with containing-block width and allowing the
segmented buttons/header to shrink/wrap fixed it; the complete headed accessibility file then
passed.

A later real Chrome toolbar run exposed the inverse sizing failure: the `max-width: 100%` and
small-viewport `width: 100%` rules let Chromium's initial measurement viewport collapse the entire
Popup into a narrow strip. The Popup now retains its 390 CSS-pixel intrinsic width while only its
internal header/buttons respond to the breakpoint. An E2E regression starts from a 40 CSS-pixel
bootstrap viewport and proves that the document and Popup both advertise 390 pixels.

This is a real assistive-technology smoke, not a claim of independent expert WCAG certification.
Store screenshot review remains a release-owner portal check.
