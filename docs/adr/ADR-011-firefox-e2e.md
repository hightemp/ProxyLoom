# ADR-011: Firefox verification strategy

Статус: Accepted.

## Решение

Основной автоматический Firefox API gate — временный MV3 install через WebDriver BiDi с Playwright
Firefox binary, `moz:allowPrivateBrowsing` и локальными origin/proxy fixtures. Он отделён от
Chromium extension fixture, потому что Playwright не поддерживает одинаковый
persistent-extension launch contract.

Test обязан проверять network evidence, а не только mock/callback shape: browser manual proxy,
`undefined`/`null`/explicit direct, single-proxy и array fallback, controlled fail-closed,
reachable proxy, Full URL path, auth attempt и settings persistence после runtime reload. Версия
browser пишется в release evidence.

`proxy.onRequest` регистрируется синхронно при создании Firefox adapter. Пока asynchronous storage
restore не завершён, первый wake-up request ожидает snapshot с ограниченным timeout; timeout или
settings failure остаётся fail-closed. Это обязательный MV3 event-page contract, а не
оптимизация.

Дополнительный headed gate запускает финальный `.output/firefox-mv3` через `web-ext` в чистом
профиле официального Firefox Stable. Firefox 153 Stable подтвердил обычный/private routing,
permission, redaction, DIRECT и пробуждение event page после 70 секунд idle. Полный signed
install/update/private/manual-settings matrix всё равно остаётся release gate и не подменяется
этим smoke.
