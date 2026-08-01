# ProxyLoom user guide

## 1. Create a proxy profile

Open **Settings → Proxies → Add profile**. Enter a name and the HTTP/WS endpoint. Clear
**Use the HTTP endpoint for all supported schemes** only when HTTPS/WSS targets require a
different endpoint. HTTP and HTTPS in the endpoint editor describe the browser-to-proxy transport.

Usernames and passwords are optional. They remain in browser-managed extension local storage and
are not protected by a ProxyLoom master password.

**Check** sends one disclosed request to the profile's Check URL through that profile. ProxyLoom
opens a temporary inactive tab, reads only the bounded JSON response, closes it, and restores the
previous route. The check endpoint receives the proxy egress IP. Cancel is available while the
request runs.

## 2. Choose a mode

- **DIRECT** bypasses rules and temporary overrides without deleting them.
- **PROXY** uses Once overrides, then the first matching rule, then the selected global proxy.
- **RULES** uses Once overrides, then the first matching rule, then direct.

Selecting a global proxy explicitly switches to PROXY. A missing/deleted profile is a
configuration error and never silently becomes direct.

## 3. Create rules

Rules have one global numeric priority. The first enabled, compatible, non-expired match wins.
Rules are evaluated strictly in their displayed global order. Categories and hidden specificity
tie-breakers are not used.

Origin Rules match normalized `scheme://hostname[:explicit-port]/` and work in all targets. Full
URL Rules include path/query without fragment and work only in Firefox. Use the template generator
and local tester before saving. When search or a filter is active, reordering is disabled to avoid
changing a hidden global order.

## 4. Current-site actions

The popup separates global controls from site controls. Choose Exact hostname or Domain +
subdomains, then Direct or a profile:

- **Once** creates session-only state above rules.
- **Always** previews and creates a permanent Origin Rule.

Firefox Once is tab-scoped when the request has a reliable tab ID. Chromium PAC has no tab ID, so
Once may affect other tabs on that origin until the source tab closes. The UI displays this warning
before confirmation.

## 5. Diagnostics and recovery

The badge shows `D`, the profile short name, `R`, or `!`. Popup and badge use the same resolver
inspection. The best-effort error page is limited to supported main-frame proxy failures and shows
hostname only. **Open Directly Once** is explicit recovery; background/WebSocket/download errors
never redirect an arbitrary tab.

Routing Logs are local, bounded to 1000 persistent entries, filterable, pausable, and clearable.
Private entries remain in memory. About / Diagnostics can copy a safe snapshot without URLs,
credentials, logs, or private state.

## 6. Import and export

Native export includes profiles, rules, general settings, and appearance. Credentials are
absent by default; including them requires an explicit plaintext warning. Import validates hostile
JSON before preview, then supports merge or confirmed replace with a local recovery backup.
Older schema v1 backups remain importable. Obsolete group metadata and untouched built-in demo
rules are discarded; user-created or edited rules retain their relative global order.

FoxyProxy import accepts supported HTTP/HTTPS profiles from known 6–9 JSON variants. Patterns,
rules, subscriptions, PAC, direct, and SOCKS entries are reported but not imported.
