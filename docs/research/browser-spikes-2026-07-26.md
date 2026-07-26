# Browser API spike evidence — 2026-07-26

Окружение: Linux, Node 22.16, Chromium 151.0.7922.34, Playwright Firefox 153.0,
official Firefox 153.0 Stable Snap, Microsoft Edge 150.0.4078.99 Stable,
Google Chrome 150.0.7871.128 Stable, Yandex Browser 26.4.1.1110 Stable, Playwright 1.62.0.

Автоматически выполнено:

```text
pnpm test:e2e
31 scenarios

pnpm test:integration
Firefox MV3 temporary BiDi install: browser manual proxy on/off, single/array fallback,
terminal null, controlled fail-closed, Full URL, one-attempt auth, runtime reload,
second-extension ownership/recovery and locked enterprise Proxy policy.
```

Chromium evidence использует только loopback origin/proxy fixtures. Проверены `DIRECT`,
mandatory PAC proxy, first-match rules, dropped connection без origin request, proxy auth,
раздельные HTTP/WS и HTTPS/WSS endpoints, HTTPS proxy transport, browser download и PAC URL
visibility. Chromium 150 передавал PAC полный URL для HTTP/WS и origin-only для HTTPS/WSS.
Chromium 151 подтвердил ту же матрицу. Неодинаковая видимость по схемам подтверждает, почему
production contract ограничен portable Origin Rules.

Firefox API evidence использует временный MV3 install через WebDriver BiDi с
`moz:allowPrivateBrowsing` и Playwright Firefox binary. При browser manual proxy
`undefined`/explicit direct и отказ одного `ProxyInfo` переходят к manual proxy, terminal `null`
идёт напрямую, а массив выполняет явный `unreachable → reachable` failover. После
`proxy.settings.set({proxyType: "none"})` dropped proxy не создаёт origin request, DIRECT остаётся
без proxy, Full URL доступен `proxy.onRequest`, а settings сохраняются после `runtime.reload`.
Production поэтому возвращает `null` для DIRECT и трактует settings control как capability gate
для fail-closed proxy actions.

В том же BiDi harness два реальных MV3 add-on подтвердили Firefox precedence:
более новый controller получил `controlled_by_this_extension`, subject наблюдал
`controlled_by_other_extensions` и не перезаписывал settings. После controller `clear` прежнее
значение subject восстановилось, явный retry вернул owned `none`. Отдельный настоящий locked
enterprise `Proxy` policy дал `not_controllable`, отклонил `set` и сохранил policy manual proxy.

Дополнительный headed smoke загрузил финальную `.output/firefox-mv3` build в чистый временный
профиль official Firefox 153 Stable Snap. После выдачи private permission обычный и private
запросы прошли через наблюдаемый loopback proxy, private log остался только в memory и исчез после
закрытия окна, synthetic path/query canaries не попали в extension storage, а DIRECT restoration
обошёл proxy. Stable-only defect показал, что MV3 `proxy.onRequest` нужно регистрировать
синхронно; после исправления request после 70 секунд idle снова прошёл через proxy.

Официальный Edge Stable `.deb` был распакован без system install. Clean-profile GUI sideload той
же Chromium build подтвердил Options/Popup, mandatory PAC, regular/InPrivate routing,
origin-only persistent log, private memory-only log, cleanup и DIRECT. Этот run обнаружил, что
Chromium `webRequest` не передаёт Firefox-style `incognito`; classification теперь определяется
по `tabId` с Chrome-private fallback.

Chrome и Yandex Stable также приняли финальную Chromium build через GUI sideload и подтвердили
core proxy ownership/DIRECT; Chrome дополнительно подтвердил real incognito Once/cleanup.

Не выполнены и не заявлены как выполненные: полные signed-package Chrome/Firefox/Edge/Яндекс
matrices, install/update/manual-proxy/rules/auth/restart variants, screen-reader/long-session и
store review. Они остаются release-owner gates.
