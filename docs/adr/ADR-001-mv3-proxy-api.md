# ADR-001: Manifest V3 proxy API и build targets

Статус: Accepted.

## Решение

Одна WXT/Vue/TypeScript база собирается в Chromium MV3 и Firefox MV3. Chromium adapter применяет
`chrome.proxy.settings` с mandatory inline PAC. Firefox adapter применяет `proxy.onRequest`,
terminal `null` для DIRECT и требует контроль `proxy.settings`, чтобы proxy failure не перешёл к
browser-defined fallback. Manifest permissions
генерируются по target: Chromium получает `webRequestAuthProvider`, Firefox —
`webRequestBlocking`.

## Причины и последствия

API имеют разную модель исполнения, поэтому parity обеспечивается общими snapshot/resolver, но
не общей platform реализацией. Full URL rules остаются Firefox-only. Минимальные версии:
Chromium 128, Firefox 140. Сборочные gates: `pnpm build`, `pnpm build:firefox`.

Evidence: `wxt.config.ts`, оба adapter, browser spike report.
