# ADR-010: Incognito isolation

Статус: Accepted with manual release gate.

## Решение

Manifest использует spanning behavior. Persisted profiles/rules общие по browser contract, а
overrides содержат обязательный `incognito` discriminator. Private logs существуют только в
memory и очищаются после закрытия последнего private window; они не попадают в IndexedDB/export.

Если пользователь не разрешил extension в private windows или browser не даёт контролировать
proxy settings, capability/status отображается честно и private actions не симулируются.

Unit tests покрывают разделение normal/private overrides и log stores. Для Chromium
`webRequest` не гарантирует Firefox-style поле `incognito`, поэтому logging bridge вычисляет
private status по `tabId` через `tabs.get` с fallback на видимый список вкладок.

Headed smokes финальных Firefox 153 Stable и Edge 150 Stable builds подтвердили browser-owned
permission, реальный private request через выбранный proxy, отдельный in-memory log count,
отсутствие canary path/query в extension storage и очистку после закрытия последнего private
window. Google Chrome 150 Stable smoke подтвердил private Once и cleanup. Полные signed-package
matrices всё равно обязательны перед публикацией. Отдельный Chromium persistent-profile restart
gate подтверждает, что normal/private session overrides и transient state не переживают полный
restart, тогда как local configuration сохраняется.
