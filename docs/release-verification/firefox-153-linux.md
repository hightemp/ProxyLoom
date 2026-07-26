# Firefox 153 Stable release-candidate verification

Date: 2026-07-26  
OS: Linux 7.0.0-28-generic x86_64  
Browser: Mozilla Firefox 153.0, official Snap published by Mozilla, revision 8664,
`latest/stable/ubuntu-24.04`  
Install: clean temporary profile, unsigned MV3 add-on loaded by `web-ext` from the final
`.output/firefox-mv3` production build

This combines the ADR-selected automated API integration with a headed, full-product run in the
official stable release channel. It is direct Firefox Stable runtime evidence, but it is not a
signed/store install, update/uninstall, policy-conflict or complete browser-manual-proxy matrix and
therefore does not close PL-122.

## Passed automated cases

- Temporary MV3 installation in the Playwright-distributed Firefox binary through WebDriver BiDi
  with explicit private-browsing permission.
- `proxy.onRequest` receives Full URL path/query and routes it.
- With browser manual proxy enabled, `undefined`, explicit direct and a failed single `ProxyInfo`
  fall back to the manual proxy, while terminal `null` goes directly.
- An explicit `unreachable → reachable` array performs ordered proxy failover.
- After `proxy.settings.proxyType = none`, a single unavailable `ProxyInfo` is fail-closed and
  DIRECT remains unproxied.
- Proxy authentication returns credentials for one proxy challenge attempt.
- The owned `none` setting survives an MV3 `runtime.reload`.
- Two real MV3 add-ons prove higher-precedence ownership, subject no-fight behavior,
  `controlled_by_other_extensions`, restoration after controller `clear` and successful retry.
- A real locked enterprise `Proxy` policy reports `not_controllable`, rejects extension writes and
  keeps its manual proxy active.
- Firefox MV3 production build and target-specific manifest validation.

## Passed official-Stable full-product smoke

- Firefox accepted and enabled ProxyLoom 0.1.0. Add-ons Manager exposed the extension's Details,
  Preferences and Permissions surfaces, and the embedded and full-page Options surfaces rendered.
- **Run in Private Windows → Allow** persisted as
  `internal:privateBrowsingAllowed`; Options reported `Incognito access: Allowed`.
- A profile was created through the visible Options UI with HTTP/HTTPS routes to the same
  loopback proxy. The profile persisted, became global and advanced the applied revision.
- Stable Firefox normally bypasses literal loopback proxy targets. The deterministic fixture used
  `network.dns.localDomains=origin.proxyloom.test` so that the test origin resolved to
  `127.0.0.1` without being treated as a loopback URL.
- Switching to PROXY routed a regular request with its complete path/query through the selected
  loopback proxy. The origin received the proxy-added `via-local-proxy` marker.
- After all extension pages were closed and the MV3 event page had been idle for 70 seconds, a
  second request still woke the event page and traversed the selected proxy.
- A real Firefox Stable private window routed an independent request through that proxy and
  received the same marker. This proves that the production `proxy.onRequest` listener was active
  in private browsing, not merely that the permission radio was selected.
- The Logs page persisted only `http://origin.proxyloom.test`, request type, planned route and
  status. It did not display any tested path/query.
- While the private window was open, Logs reported exactly one private entry held only in memory
  and excluded it from the persistent table. The notice disappeared after the last private window
  closed.
- A binary scan of both normal and private extension-storage directories found none of
  `stable-never-store`, `event-page-canary` or `private-stable-canary`.
- Switching back to DIRECT produced a subsequent origin response marked `direct`, with no matching
  proxy request. Firefox's owned `proxy.settings` entry remained the expected
  `{ "proxyType": "none" }`.
- The visible Popup surface loaded and reflected PROXY plus the selected profile; direct
  extension-page inspection correctly reported an unsupported current tab.
- The loopback servers stopped, the temporary Snap-compatible Firefox profile was deleted and no
  test port or Firefox process remained.

Observed network evidence:

```text
proxy  -> http://origin.proxyloom.test:48765/stable-routed?secret=stable-never-store
origin -> /stable-routed?secret=stable-never-store marker=via-local-proxy
proxy  -> http://origin.proxyloom.test:48765/stable-after-idle?secret=event-page-canary
origin -> /stable-after-idle?secret=event-page-canary marker=via-local-proxy
proxy  -> http://origin.proxyloom.test:48765/stable-private?secret=private-stable-canary
origin -> /stable-private?secret=private-stable-canary marker=via-local-proxy
origin -> /stable-direct-restored marker=direct
```

The secrets above are synthetic canaries used only to prove that path/query data does not enter
extension storage; the temporary browser profile was deleted after the scan.

## Stable-only defect found and fixed

The first official-Stable run applied the visible PROXY state, but a request after the MV3 event
page became idle went DIRECT. Firefox persists event listeners only when they are registered
synchronously during background startup; ProxyLoom had registered `proxy.onRequest` after an
asynchronous configuration read.

`FirefoxProxyAdapter` now registers the listener in its constructor. Requests arriving during
startup wait for snapshot restoration, while initialization timeout or settings failure remains
fail-closed. Four focused adapter tests cover synchronous registration, wake-up restoration,
explicit DIRECT and settings failure. Rebuilding and repeating the Stable run produced the
regular, 70-second idle-wake and private routing evidence above.

## Remaining PL-122 boundary

The run did not install a signed XPI/ZIP and did not cover update/uninstall, the full
DIRECT/PROXY/RULES UI matrix under every browser manual-proxy state, every
HTTP/HTTPS/WS/WSS/download/auth variant, full browser restart, theme/screen-reader/long-session
checks or Mozilla Add-ons review. Those cases remain release-owner checks. The document claims an
official Firefox Stable runtime smoke plus automated API semantics, not signed-package or store
approval.
