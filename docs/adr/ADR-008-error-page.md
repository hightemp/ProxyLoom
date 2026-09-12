# ADR-008: Best-effort error page

Статус: Accepted.

## Решение

Только поддерживаемая proxy failure для `main_frame` при включённой настройке `Show ProxyLoom error
page` создаёт bounded TTL context и пытается перевести исходную вкладку на extension error page.
При выключенной настройке coordinator не создаёт context и не вызывает `tabs.update`, оставляя
browser-native error page. Context содержит hostname, code, profile/rule IDs/names и timestamp;
полный URL хранится отдельно только до одноразового Retry.

Error-page response вычисляет из отдельного exact retry URL только safe origin
`scheme://hostname[:port]/`. Он отображается как ссылка; обычный click вызывает тот же one-time
Retry, что и кнопка. Exact path/query/fragment/credentials не попадают ни в текст, ни в `href`.
Safe origin не дублируется в session envelope, поэтому его schema остаётся v1.

Retry state использует bounded versioned envelope в `storage.session`, а не service-worker global.
Поэтому допустимая остановка MV3 worker и переключение global mode не обрывают recovery в течение
пятиминутного TTL. Context удаляется после Retry, закрытия source tab, expiry или browser restart.
Namespace введён сразу как schema v1; legacy payload для migration отсутствует, а malformed/future
version трактуется как пустое безопасное состояние. Persisted config/native export schema не
меняются.

Subresource/WebSocket/background failures не перенаправляются. Loop guard и internal-URL
исключение обязательны. Ошибка называется best effort, потому что post-failure tab update не
атомарен с browser navigation.

Chromium может сообщать `main_frame` failure для спекулятивной загрузки ссылки, которая не является
навигацией видимой вкладки. Поэтому error navigation принимает только active `documentLifecycle`,
`outermost_frame`, root `frameId`/`parentFrameId`; `prerender`, `cached`, `pending_deletion` и
не-outermost frames игнорируются. Metadata оставлена optional для совместимости с Firefox events,
которые не обязаны предоставлять Chromium-specific lifecycle fields. Это не меняет fail-closed
routing: фоновый запрос всё равно завершается ошибкой назначенного proxy, но не захватывает tab и не
создаёт неверный Retry context.

Private context хранит `incognito`, поэтому `Open Directly Once` не пересекает обычную сессию.

Явные proxy/tunnel/auth ошибки поддерживаются напрямую. `EMPTY_RESPONSE`, timeout и transport
reset/close обрабатываются best effort только после повторного подтверждения resolver, что запрос
был назначен proxy; это нужно для drop/hang proxy, где Chromium не помечает код словом `PROXY`.
`ABORTED`, blocked-client и ambiguous DNS errors не перенаправляются.
