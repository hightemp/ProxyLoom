# Known limitations

- Full URL path/query rules are Firefox-only. Chromium receives origin-only PAC targets for HTTPS
  and WSS; HTTP/WS exposure is not a portable cross-scheme contract. ProxyLoom intentionally
  offers only portable Origin Rules there.
- Chromium temporary Once overrides are origin-scoped across tabs until source-tab cleanup.
- Firefox uses terminal `null` for DIRECT, but secure proxy routing still requires control of
  `proxy.settings` so an unavailable assigned proxy cannot fall back to a user manual/system
  proxy. Policy, another extension, or missing private-browsing access can block apply; controls
  report the conflict instead of simulating success.
- Error-page navigation is best effort because browser post-failure events do not provide an
  atomic redirect.
- Browsers do not expose a reliable proxy connect phase, so manual-check connect duration can be
  **Not available**.
- Established WebSocket message payloads are not observed or logged; only the handshake is routed.
- Edge and Yandex use the Chromium ZIP. Both passed a branded Stable GUI sideload/proxy-control
  smoke, but still require the complete signed-package manual matrix before store publication.
