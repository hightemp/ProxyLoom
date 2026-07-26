# ADR-004: Firefox fallback и DIRECT semantics

Статус: Accepted.

## Решение

Для proxy action `proxy.onRequest` возвращает один `ProxyInfo`. После отказа этого endpoint Firefox
может перейти к browser-defined proxy settings. Массив означает явную цепочку proxy failover:
Firefox пробует элементы по порядку; production массивы не использует. Поэтому перед применением
routing snapshot adapter устанавливает и подтверждает `proxy.settings.proxyType = "none"`.

`undefined` означает отсутствие per-request override и передаёт выбор browser-defined settings.
Terminal `null` отправляет запрос без proxy даже при включённом user manual proxy.
`{type: "direct"}` является `ProxyInfo` и не перекрывает manual proxy. Production возвращает
`null` для DIRECT. Контроль settings всё равно обязателен для snapshot с proxy actions: иначе
отказ назначенного proxy нарушил бы fail-closed contract.

Если settings не контролируются, apply завершается ошибкой и UI показывает control conflict.

## Evidence

Firefox 153 temporary MV3 test устанавливает add-on через WebDriver BiDi с
`moz:allowPrivateBrowsing`, задаёт реальный browser manual proxy и снимает loopback network
evidence. Он подтвердил:

- `undefined` и `{type: "direct"}` используют manual proxy;
- terminal `null` идёт напрямую;
- отказ одного `ProxyInfo` переходит к manual proxy;
- массив `unreachable → reachable` выполняет явный failover;
- после `proxy.settings.proxyType = "none"` один unreachable `ProxyInfo` остаётся fail-closed;
- `none` сохраняется после MV3 `runtime.reload`, а DIRECT остаётся без proxy.

Official Stable smoke дополнительно подтвердил synchronous `proxy.onRequest` registration и
snapshot restoration после MV3 idle wake. Форма API сверена с
[MDN proxy.onRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest)
и [ProxyInfo](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/ProxyInfo).
