# ADR-016: SOCKS5 transport в Chromium и Firefox MV3

Статус: Accepted with manual release gate.

Дата: 2026-11-04. Задача: PL-144. Требования: FR-006, FR-010, FR-075, COMPAT-001, SEC-003.

## Контекст

PRD v1 исключал SOCKS4/5 (FR-010), а импорт возвращает typed error для SOCKS-строк (FR-082).
Перед PL-145 нужно было проверить на реальных браузерах: проходит ли SOCKS5 через тот же routing
path (Chromium PAC, Firefox `proxy.onRequest`), как ведут себя auth и DNS, и сохраняется ли
fail-closed без скрытого `DIRECT`.

## Метод

Prototype находится в `spikes/socks5/` и не переносится в production:

- `tests/integration/proxies/socks5-proxy.ts` — локальный RFC 1928 SOCKS5 server (CONNECT) с
  опциональным RFC 1929 username/password. Он записывает тип адреса (`DOMAIN`/`IPV4`/`IPV6`),
  метод auth и исход, но никогда не записывает password. Только этот server резолвит имена
  `*.proxyloom.test`, поэтому успешная загрузка имени, которое браузер локально не резолвит,
  доказывает DNS на стороне proxy. Fixture покрыт `tests/integration/socks5-proxy-fixture.test.ts`.
- `spikes/socks5/chromium.spike.ts` — минимальное MV3 расширение ставит
  `chrome.proxy.settings` `pac_script` (`mandatory: true`, как production adapter) с
  `SOCKS5 127.0.0.1:<port>` и слушает `webRequest.onAuthRequired` (`asyncBlocking`). Локально
  резолвится только `mapped.proxyloom.test` (`--host-resolver-rules`), поэтому `DIRECT` fallback
  был бы виден как запрос на origin.
- `spikes/socks5/firefox.spike.ts` — временное MV3 расширение (WebDriver BiDi, как ADR-011)
  возвращает из `proxy.onRequest` `ProxyInfo {type: 'socks', host, port, proxyDNS, username,
password}`. До сценариев ставится `proxy.settings.proxyType = 'none'` (ADR-004).
- Sanitized traces: `spikes/socks5/evidence/*.json`. Ephemeral ports заменены placeholders;
  если synthetic username/password попадает в trace, запись падает.

Запуск: `pnpm spike:socks5`. Для Firefox `PROXYLOOM_FIREFOX_BINARY` выбирает бинарь, для
Chromium-family `PROXYLOOM_BROWSER_EXECUTABLE` и `PROXYLOOM_BROWSER_LABEL`.

## Наблюдения

| Сценарий                                           | Chromium 151 (Playwright)                                                                                              | Brave 155 (Chromium 155)                      | Firefox 153 (Playwright)                                                   | Firefox 157 Stable (snap) |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| HTTP через SOCKS5 без auth                         | ✅                                                                                                                     | ✅                                            | ✅                                                                         | ✅                        |
| HTTPS (CONNECT в туннеле)                          | ✅                                                                                                                     | ✅                                            | ✅                                                                         | ✅                        |
| WS / WSS                                           | ✅ / ✅                                                                                                                | ✅ / ✅                                       | ✅ / ✅                                                                    | ✅ / ✅                   |
| Download (browser download / `downloads.download`) | ✅                                                                                                                     | ✅                                            | ✅                                                                         | ✅                        |
| DNS                                                | всегда `DOMAIN` (proxy-side), даже для локально резолвимого имени                                                      | так же                                        | `proxyDNS: true` → `DOMAIN`; `proxyDNS: false` → локальный DNS, `IPV4`     | так же                    |
| SOCKS5 server требует username/password            | предлагается только `NO AUTH`; `onAuthRequired` не вызывается; `net::ERR_SOCKS_CONNECTION_FAILED`; origin не достигнут | так же                                        | `username`/`password` в `ProxyInfo` проходят RFC 1929 без `onAuthRequired` | так же                    |
| Неверный / отсутствующий password                  | —                                                                                                                      | —                                             | `NS_ERROR_CONNECTION_REFUSED`, origin не достигнут                         | так же                    |
| Недоступный SOCKS5 endpoint                        | `net::ERR_PROXY_CONNECTION_FAILED`, без `DIRECT`                                                                       | так же                                        | `NS_ERROR_PROXY_CONNECTION_REFUSED`, без `DIRECT`                          | так же                    |
| `SOCKS5 user:pass@host:port` в PAC                 | директива отбрасывается, запрос уходит **`DIRECT`** даже при `mandatory: true`                                         | директива принимается, RFC 1929 auth проходит | n/a                                                                        | n/a                       |
| Private window                                     | manual gate (см. ниже)                                                                                                 | manual gate                                   | `incognito: true` в `onRequest`, запрос через SOCKS5                       | так же                    |

Дополнительно:

- Firefox при неверном пароле повторяет handshake без credentials (`NO_ACCEPTABLE`), затем
  завершает запрос ошибкой. Авто-повторов с другими credentials или fallback нет.
- Ошибка auth в Firefox (`NS_ERROR_CONNECTION_REFUSED`) неотличима по коду от отказа соединения;
  UI не может утверждать «неверный пароль», только «SOCKS5 proxy отклонил соединение».
- Google Chrome 155 Stable не загружает unpacked extension через `--load-extension`, а
  Яндекс Браузер под automation останавливает MV3 worker prototype (как в ADR-005). Для них,
  Edge и Chromium incognito вывод основан на общем Chromium network stack и требует ручной
  проверки (ниже).

## Решение

SOCKS5 добавляется как третий `ProxyTransport` (`SOCKS5`) в PL-145. Рекомендация положительная с
ограничениями:

1. **Chromium-family:** PAC directive `SOCKS5 host:port` для proxy action. Proxy-side DNS
   встроен и не настраивается. Proxy auth для SOCKS5 недоступна: в MV3 нет API, `onAuthRequired`
   не вызывается.
2. **Firefox:** один `ProxyInfo {type: 'socks', host, port, proxyDNS: true}`; credentials
   передаются полями `username`/`password` того же `ProxyInfo`, а не через `onAuthRequired`.
   `proxyDNS` всегда `true`, чтобы DNS не утекал мимо proxy и поведение совпадало с Chromium.
   ADR-004 остаётся в силе: `proxyType = 'none'` перед apply, никаких массивов.
3. **Capability `socks5Auth`:** Chromium-family `false`, Firefox `true`. UI и application
   получают её через capability service, без browser-name flags.
4. **SOCKS5 профиль с credentials в Chromium** сохраняется без потерь. Routing не меняется: PAC
   по-прежнему возвращает `SOCKS5 host:port`, server отклоняет handshake, запрос завершается
   ошибкой (fail-closed). UI показывает статус `Authentication unsupported in this browser`;
   правило не пропускается и не превращается в `DIRECT`.
5. **PAC serializer никогда не выдаёт userinfo.** Stock Chromium превращает такую директиву в
   `DIRECT`, а Brave принимает её. Поведение зависит от vendor и нарушает FR-006/FR-075.
   PL-145 добавляет injection/golden cases, доказывающие, что host с `@`, `:` вне IPv6-скобок,
   `;` или пробелом не попадает в directive.
6. **Import:** `socks5://` и `socks5h://` оба становятся `SOCKS5` с proxy-side DNS. Preview
   поясняет, что локальный DNS (`socks5://` в curl-смысле) не поддерживается. `socks4`/`socks4a`
   остаются typed error.
7. **Error classification:** `net::ERR_SOCKS_CONNECTION_FAILED`, `net::ERR_PROXY_CONNECTION_FAILED`,
   `NS_ERROR_PROXY_CONNECTION_REFUSED` и `NS_ERROR_CONNECTION_REFUSED` для SOCKS5 profile
   относятся к proxy failure (error page/log без credentials).
8. **Proxy check (ADR-007)** использует тот же temporary route override, поэтому SOCKS5 check и
   speed test проходят через тот же directive/ProxyInfo без отдельной реализации.

Отвергнуто:

- `chrome.proxy` `fixed_servers` с `socks5`: не даёт per-rule routing и тоже не принимает
  credentials.
- Userinfo в PAC: vendor-specific, а в stock Chromium приводит к `DIRECT`.
- Local SOCKS relay/native messaging для Chromium auth: новая native component, permission и
  threat surface; вне scope v1.
- Firefox `proxyDNS: false`: DNS leak и расхождение семантики с Chromium.

## Security и privacy

- Новых permissions, внешних обращений и data fields, кроме `SOCKS5` transport, нет.
- Firefox credentials по-прежнему живут только в `storage.local` (ADR-005, SEC-003); `ProxyInfo`
  не логируется.
- Proxy-side DNS уменьшает утечку DNS по сравнению с локальным резолвом.
- Fail-closed подтверждён для недоступного endpoint, отказа auth и неверного password в обоих
  семействах.

## Manual release gate

Перед релизом PL-145 вручную (signed/unpacked build из PL-145):

- Google Chrome Stable, Microsoft Edge Stable, Яндекс Браузер: SOCKS5 без auth (HTTP/HTTPS),
  недоступный endpoint без `DIRECT`, SOCKS5 с credentials → ошибка и видимый статус.
- Chromium incognito (`spanning`): private tab идёт через тот же SOCKS5 directive.
- Firefox signed build: SOCKS5 с auth и private window.

## Evidence

- `pnpm spike:socks5` — Chromium и Firefox prototype, зелёные 3 прогона подряд (Chromium 151,
  Firefox 153), плюс Brave 155 и Firefox 157 Stable через env overrides.
- `pnpm test:integration` включает `socks5-proxy-fixture.test.ts`.
- Traces: `spikes/socks5/evidence/chromium-151.json`, `brave-155.json`, `firefox-153.json`,
  `firefox-157.json`.
- Форма API сверена с
  [MDN ProxyInfo](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/ProxyInfo)
  и [Chrome `chrome.proxy`](https://developer.chrome.com/docs/extensions/reference/api/proxy).
