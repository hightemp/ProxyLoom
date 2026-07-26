# ADR-006: HTTP/HTTPS endpoint routing

Статус: Accepted.

## Решение

Target HTTP и WS используют `httpEndpoint`; target HTTPS и WSS — `httpsEndpoint`.
`useSameProxy` делает второй endpoint производным от HTTP. Transport endpoint (`HTTP`/`HTTPS`)
определяет соединение browser→proxy и не меняет target-scheme mapping.

## Evidence

Pure resolver tests покрывают четыре target scheme. Chromium browser E2E использует разные
локальные proxy markers для HTTP/WS и HTTPS/WSS и отдельный TLS proxy fixture. Firefox adapter
формирует `type: "http" | "https"` из того же resolved endpoint.
