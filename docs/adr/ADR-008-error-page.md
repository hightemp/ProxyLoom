# ADR-008: Best-effort error page

Статус: Accepted.

## Решение

Только поддерживаемая proxy failure для `main_frame` создаёт bounded TTL context и пытается
перевести исходную вкладку на extension error page. Context содержит hostname, code, profile/rule
IDs/names и timestamp; полный URL хранится отдельно только до одноразового Retry.

Subresource/WebSocket/background failures не перенаправляются. Loop guard и internal-URL
исключение обязательны. Ошибка называется best effort, потому что post-failure tab update не
атомарен с browser navigation.

Private context хранит `incognito`, поэтому `Open Directly Once` не пересекает обычную сессию.

Явные proxy/tunnel/auth ошибки поддерживаются напрямую. `EMPTY_RESPONSE`, timeout и transport
reset/close обрабатываются best effort только после повторного подтверждения resolver, что запрос
был назначен proxy; это нужно для drop/hang proxy, где Chromium не помечает код словом `PROXY`.
`ABORTED`, blocked-client и ambiguous DNS errors не перенаправляются.
