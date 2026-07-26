# ProxyLoom store listing

## Short description

Clear, deterministic HTTP and HTTPS proxy routing with ordered rules and no hidden direct fallback.

## Full description

ProxyLoom gives you explicit DIRECT, PROXY, and RULES modes; separate HTTP/HTTPS endpoints;
first-match ordered rules; per-site Once/Always actions; local diagnostics; and safe import/export.

Assigned proxy routes fail closed. Origin Rules work across Chromium and Firefox. Firefox also
supports Full URL path/query rules. Chromium clearly marks and skips those rules because its PAC
API cannot provide portable full-URL behavior.

Everything stays local except normal traffic through proxies you configure and a manual IP/country
check you explicitly start. There are no analytics, ads, accounts, remote configuration, or remote
code. Credentials are stored in ordinary browser extension storage and omitted from exports by
default.

## Single purpose

Let users define and diagnose deterministic browser proxy routing.

## Reviewer notes

- The `scripting` permission is exercised only after a Check click against an inactive temporary
  tab created by the extension; it reads a bounded JSON provider response and closes the tab.
- Chromium Once is origin-scoped and visibly disclosed. Firefox can use reliable tab scope.
- The error page is best effort and main-frame only.
- Store publication is manual; the repository release workflow publishes GitHub artifacts only.
