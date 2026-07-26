# FoxyProxy fixtures

The fixtures are synthetic and contain no real browsing data or credentials.
`v8-redacted.json` follows the FoxyProxy 8+ `data[]` export shape from the
upstream `foxyproxy/browser-extension` repository (reviewed at version 9.2).
`v7-redacted.json` follows the v6–7 object-entry shape documented by the
upstream `Migrate.convert7` adapter.

ProxyLoom intentionally imports only HTTP/HTTPS endpoint profiles. Patterns,
rules, groups, subscriptions, containers, logs, PAC, direct, and SOCKS entries
are excluded and reported to the user.
