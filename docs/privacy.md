# ProxyLoom privacy disclosure

Last updated: 2026-07-26.

ProxyLoom has no analytics, telemetry, advertising, account service, remote configuration, crash
upload, or remotely executed code. The extension does not sell or share data.

## Data stored locally

- Profiles, endpoints, optional proxy credentials, rules, preferences, and appearance are
  stored in browser-managed extension local storage.
- Credentials are plaintext application data inside that browser storage boundary. ProxyLoom does
  not claim encryption or a master-password vault.
- Temporary overrides and recovery markers use extension session storage and expire on restart,
  tab cleanup, or timeout.
- Persistent routing logs use IndexedDB and are capped at 1000 entries. They contain scheme,
  hostname, route/result metadata, status, and timing; never path, query, fragment, headers, bodies,
  cookies, or credentials.
- Private-window logs remain only in memory and are cleared after the private session.

## Network access

Normal browsing is routed to the proxy endpoints configured by the user. A proxy can observe
traffic according to the browser/protocol/TLS model. Proxy credentials are sent only in matching
proxy-auth challenges and never to ordinary site-auth challenges.

ProxyLoom makes no application telemetry requests. A manual profile check is the sole optional
external provider request. It occurs only after **Check**, uses the visible per-profile URL, travels
through that profile, and reveals the proxy egress IP to that endpoint. The response is limited to
64 KiB and read from a temporary inactive tab that is immediately closed. The request is excluded
from routing logs and error-page redirects. Users can replace the endpoint or disable country
parsing.

The default endpoint is `https://api.country.is/`. Its
[provider documentation](https://country.is/) stated on 2026-07-26 that the service requires no
API key and does not log requests. A live release check also confirmed HTTP 200, the documented
`ip`/`country` JSON shape and extension-compatible CORS without recording the returned values.
That statement belongs to the independent provider and may change; users can replace the endpoint,
and every release must recheck its documentation and observed behavior.

## Import and export

Native exports omit username/password keys by default. An opt-in export displays a warning and
writes credentials as plaintext JSON. Imports are treated as hostile, size/depth/schema validated,
previewed, and applied atomically. FoxyProxy imports copy only selected supported profiles.

## Permissions

See [the permission rationale](../store/permission-rationale.md). In particular, `scripting` is
used only to read the bounded JSON body of the explicit temporary check tab; ProxyLoom does not use
that permission to inject functionality into ordinary user pages.

Uninstalling the extension asks the browser to remove its extension storage. Browser download
history and files are owned by the browser and are not deleted by ProxyLoom.
