# Microsoft Edge 150 Stable release-candidate smoke

Date: 2026-07-26  
OS: Linux 7.0.0-28-generic x86_64  
Browser: Microsoft Edge 150.0.4078.99 Stable for Linux  
Browser package: official Microsoft `microsoft-edge-stable_150.0.4078.99-1_amd64.deb`,
SHA-256 `46a83dcaf910e22ba72d3b3d6eb54fd155afe5db74a439b4f465c623b672665c`  
Install: the official package was downloaded and extracted into a temporary directory without
changing the system; a clean profile used Developer mode and GUI **Load unpacked** from
`.output/chrome-mv3`

This is direct branded-browser evidence from the same Chromium production tree used for Chrome
and Yandex Browser. It is broader than a command-line launch check, but it is not the release
owner's signed PL-123 matrix.

## Passed checks

- Edge accepted and enabled ProxyLoom 0.1.0, exposed its details/options surfaces and started the
  MV3 service worker without an extension load error.
- A profile pointing at a deterministic loopback proxy was created through the visible Options UI
  and reflected by Popup.
- `chrome.proxy.settings` reported `controlled_by_this_extension`, `pac_script`,
  `mandatory: true` and the expected endpoint in PROXY mode.
- A regular request to `origin.proxyloom.test` traversed the selected proxy. The proxy observed the
  complete test URL and the origin received `via-edge-stable-proxy`.
- With local routing logging enabled, the persistent page stored only
  `http://origin.proxyloom.test`; neither tested path/query canary appeared in the UI or
  `chrome.storage.local`.
- Edge's extension details UI enabled **Allow in InPrivate** and
  `isAllowedIncognitoAccess()` returned `true`.
- A real Edge InPrivate window and tab were visible to the extension with `incognito: true`. Its
  request traversed the proxy and received the same network marker.
- On the corrected build, Logs reported exactly one private entry held only in memory and zero
  matching persistent rows. A binary scan of the extension's Local Extension Settings and
  IndexedDB directories found no `edge-private-clean-never-store`.
- Closing the last InPrivate window immediately cleared the private-memory count.
- Switching back to DIRECT produced `mode: direct`; the final request reached only the origin with
  marker `direct`.
- The browser and loopback servers stopped, and the temporary Edge profile, extracted browser and
  downloaded package were deleted.

Observed network evidence:

```text
proxy  -> http://origin.proxyloom.test:48865/edge-proxied?secret=edge-stable-canary
origin -> /edge-proxied?secret=edge-stable-canary marker=via-edge-stable-proxy
proxy  -> http://origin.proxyloom.test:48865/edge-private-clean?secret=edge-private-clean-never-store
origin -> /edge-private-clean?secret=edge-private-clean-never-store marker=via-edge-stable-proxy
origin -> /edge-final-direct marker=direct
```

## Edge-only defect found and fixed

Chromium `webRequest` details do not provide the Firefox-style `incognito` field. The first
InPrivate run therefore classified its redacted log as persistent even though routing and
redaction were correct.

The logging bridge now resolves private status from the request `tabId`. It first uses `tabs.get`
and falls back to the visible tab list, which also handles the branded-Chrome private-tab behavior
already observed in the Chrome Stable smoke. Four focused tests cover an explicit browser flag,
normal Chromium tab lookup, the private-tab fallback and vanished/internal tabs. Rebuilding,
reloading and repeating the clean private-log check produced one memory-only entry, zero
persistent entries and cleanup after the last InPrivate window closed.

## Evidence boundary

The run did not sign install-warning variants, update/uninstall, every transport/auth/rules case,
enterprise policy, second-extension conflicts, long-session/screen-reader behavior or Edge Add-ons
portal review. Those remain part of the complete PL-123 and PL-124 release-owner gates.
