# Chromium 151 automated release-candidate verification

Date: 2026-07-26  
OS: Linux 7.0.0-28-generic x86_64  
Browser: Playwright Chromium 151.0.7922.34  
Install: clean temporary persistent profile, unpacked `.output/chrome-mv3`

This is reproducible automated evidence, not the signed Chrome Stable manual matrix required by
PL-121.

## Passed automated cases

- MV3 install and service-worker discovery on a clean profile.
- DIRECT and mandatory global proxy routing.
- Ordered first-match rule semantics and DIRECT Rules fallback.
- Dropped/unreachable selected proxy with zero direct-origin requests.
- One-attempt proxy authentication; password absent from captured fixture output.
- Separate HTTP/WS and HTTPS/WSS endpoints.
- HTTP and HTTPS proxy transports.
- HTTP, HTTPS, WebSocket, secure WebSocket and download routing.
- PAC URL observations and resolver/PAC parity.
- Origin-scoped Once disclosure and source-tab cleanup.
- Popup Once and Always creation plus matched-rule navigation through visible UI.
- Inactive profile Check through a temporary exact-origin snapshot, cancellation and restoration.
- Profile/rule/group CRUD, import/export, theme persistence and error-surface smoke.
- Accessibility, 200% equivalent reflow and warm Popup/rule-apply performance gates.

Commands:

```text
pnpm test:integration
pnpm test:e2e
```

## Not signed here

Chrome Stable received a separate clean-profile GUI and incognito smoke. UI install-warning
variations, enterprise policy, manual screen reader and long-session memory checks still require
the release-owner clean-profile checklist. The automated Chromium suite covers a real
second-extension proxy-control conflict.
