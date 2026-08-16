# ADR-008: Best-effort error page

Статус: Accepted.

## Решение

Только поддерживаемая proxy failure для `main_frame` создаёт bounded TTL context и пытается
перевести исходную вкладку на extension error page. Context содержит hostname, code, profile/rule
IDs/names и timestamp; полный URL хранится отдельно только до одноразового Retry.

Retry state использует bounded versioned envelope в `storage.session`, а не service-worker global.
Поэтому допустимая остановка MV3 worker и переключение global mode не обрывают recovery в течение
пятиминутного TTL. Context удаляется после Retry, закрытия source tab, expiry или browser restart.
Namespace введён сразу как schema v1; legacy payload для migration отсутствует, а malformed/future
version трактуется как пустое безопасное состояние. Persisted config/native export schema не
меняются.

Subresource/WebSocket/background failures не перенаправляются. Loop guard и internal-URL
исключение обязательны. Ошибка называется best effort, потому что post-failure tab update не
атомарен с browser navigation.

Private context хранит `incognito`, поэтому `Open Directly Once` не пересекает обычную сессию.

Явные proxy/tunnel/auth ошибки поддерживаются напрямую. `EMPTY_RESPONSE`, timeout и transport
reset/close обрабатываются best effort только после повторного подтверждения resolver, что запрос
был назначен proxy; это нужно для drop/hang proxy, где Chromium не помечает код словом `PROXY`.
`ABORTED`, blocked-client и ambiguous DNS errors не перенаправляются.
