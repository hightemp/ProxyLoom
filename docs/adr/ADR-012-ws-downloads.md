# ADR-012: WebSocket и downloads

Статус: Accepted.

## Решение

WS следует HTTP endpoint, WSS — HTTPS endpoint. Routing snapshot применяется browser-wide, поэтому
download использует тот же assigned proxy. Manifest включает `downloads` и `notifications` для
наблюдаемого download failure UX; logging сохраняет только allowlisted/redacted target data.

Chromium E2E поднимает реальные WS/WSS upgrade endpoints и browser download, проверяя marker
назначенного proxy. PAC URL visibility для WS/WSS зафиксирована отдельно. Firefox использует ту
же target-scheme mapping resolver.

Error page никогда не открывается для WebSocket/subresource/download; download failure должен
получить notification и log.
