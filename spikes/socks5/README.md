# SOCKS5 spike (PL-144)

Prototype for [ADR-016](../../docs/adr/ADR-016-socks5.md). Nothing here is imported by production
code; PL-145 implements SOCKS5 in `src/` with its own tests.

- `chromium.spike.ts` — MV3 extension with a `SOCKS5 host:port` PAC script (`mandatory: true`).
- `firefox.spike.ts` — MV3 extension returning `proxy.onRequest` `type: 'socks'` ProxyInfo.
- `trace.ts` — writes sanitized traces to `evidence/` (ports replaced, synthetic secrets rejected).
- The SOCKS5 server is the shared test fixture `tests/integration/proxies/socks5-proxy.ts`.

```bash
pnpm spike:socks5
# Other browsers of the same family:
PROXYLOOM_FIREFOX_BINARY=/snap/firefox/current/usr/lib/firefox/firefox pnpm spike:socks5 spikes/socks5/firefox.spike.ts
PROXYLOOM_BROWSER_EXECUTABLE=/usr/bin/brave-browser PROXYLOOM_BROWSER_LABEL=brave pnpm spike:socks5 spikes/socks5/chromium.spike.ts
```

Branded Google Chrome no longer loads unpacked extensions from the command line, and Yandex Browser
stops the prototype worker under automation; both are manual rows in ADR-016.
