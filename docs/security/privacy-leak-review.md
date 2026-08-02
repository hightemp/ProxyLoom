# Credential and privacy leak review

Date: 2026-07-26  
Scope: PL-120, logs, errors, diagnostics, exports, proxy authentication, manual check and artifacts.

## Result

No unexpected credential/full-path/query transmission or persistence was found by the automated
canary tests and local proxy/origin captures.

## Data-flow findings

- Persistent routing logs contain scheme, hostname, planned route, IDs/names, status and timing;
  they omit user info, path, query, fragment, headers and credentials.
- Private-window logs use a bounded in-memory buffer and are cleared when the last private window
  closes. They are not written to IndexedDB.
- Error correlation stores a redacted hostname/origin context behind a short-lived random token.
- Download failure records and notifications contain a hostname and bounded error code only.
- Safe diagnostics exclude configuration, credentials, URLs, logs and private state.
- Default native export omits credential keys, logs and overrides. Explicit credential export is
  the only export path where a credential canary is expected.
- Proxy fixture captures strip `Proxy-Authorization`; authentication tests observe only
  authenticated/not-authenticated markers and verify passwords are absent from captured output.
- Release artifacts are scanned for credential/path/query canaries and dynamic code.

Allowed boundaries:

1. credentials in local extension configuration;
2. credentials passed to the browser proxy-auth response for the selected endpoint;
3. credentials in an explicitly confirmed plaintext credential export;
4. the explicit manual check request, whose configured provider necessarily sees the proxy egress
   IP and normal request metadata.

## External requests

There is no telemetry, account, ad, remote configuration or remote-code endpoint. Ordinary
browsing goes direct or through user-configured proxies. The IP/country provider is contacted only
after an explicit Check and can be replaced in settings.

## Console, storage, trace and network inspection

- The Chrome Stable smoke loaded Options, Popup and the error surface without a page or console
  error and verified that a private path/query canary did not enter the stored override.
- The Edge and Firefox Stable smokes captured each loopback proxy/origin request, then searched
  extension local storage and IndexedDB for path/query/private canaries. Only the proxy and origin
  fixtures saw the ordinary browsing URL; extension persistence did not.
- Chromium E2E exercises authenticated proxy traffic with a password canary, inspects the redacted
  proxy capture, verifies the log UI does not expose URL credentials/path/query/fragment and reads
  the downloaded default export to ensure credential keys, logs and overrides are absent.
- Routing E2E traces are disabled because those tests apply complete credential-bearing profiles
  through the page context. Failure artifacts and the Playwright HTML report are uploaded only
  after `pnpm scan:test-artifacts` succeeds. Candidate store screenshots are synthetic,
  dimension-checked and scanned with the other release assets.
- A production-source inspection found no `fetch`, XHR, beacon or application WebSocket telemetry
  call. The only built-in external endpoint literal is the disclosed, replaceable manual
  `https://api.country.is/` setting; the actual check uses an explicit temporary tab and restores
  proxy state.

## Accepted residual risk

Browser diagnostics outside the extension's control and a compromised device/profile may expose
local credentials or network metadata. Proxy credentials intentionally remain in the browser's
local extension storage, as disclosed. Authenticated store privacy forms can still change and are
rechecked under PL-115; that external portal gate does not invalidate this completed product
inspection.
