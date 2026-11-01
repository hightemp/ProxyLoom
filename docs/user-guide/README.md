# ProxyLoom user guide

## 1. Create a proxy profile

Open **Settings → Proxies → Add profile**. Enter a name and the HTTP/WS endpoint. Clear
**Use the HTTP endpoint for all supported schemes** only when HTTPS/WSS targets require a
different endpoint. HTTP and HTTPS in the endpoint editor describe the browser-to-proxy transport.

**Paste proxy string** at the top of the editor accepts one proxy in any of the formats listed in
[Proxies from text](#proxies-from-text) and fills the protocol, host, port, username and password,
switches to one endpoint for all schemes and suggests `host:port` as the name when it is empty.
For `a:b:c:d` strings that are valid both ways, choose the reading. The pasted text is cleared
after filling.

Usernames and passwords are optional. They remain in browser-managed extension local storage and
are not protected by a ProxyLoom master password.

Profiles are listed as compact rows: color, name and short name, protocol and endpoint(s),
username (never the password), how many rules use it and the last check result. Long hosts and
usernames are shortened with the full value in a tooltip. Each row has one-click **Edit**, **Use
globally** and **Check** buttons; **⋯** holds Duplicate, the copy actions and Delete. The editor
opens in a centered dialog with sections for the pasted string, general settings, the endpoint and
credentials (with a show/hide password button) and advanced options; closing it returns focus to
the Edit button. **Import from text** opens in a dialog and accepts a dropped file.

Above the profile cards, search by name or host and filter by protocol or last check result; the
list shows how many profiles match. Select profiles with their checkboxes or **Select all shown**,
then **Check selected** runs manual checks one at a time (with **Stop**), and **Delete selected**
removes them in one step after an impact preview.

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

Each rule row shows its position, name, route (Direct or the profile chip), compatibility and
validity badges, a shortened pattern you can expand, and an **Enabled** switch. ↑/↓ reorder from
the keyboard and the pencil opens the editor; **⋯** holds Duplicate, temporary disable and Delete. Search is always visible; **More filters**
opens action, profile, enabled and compatibility filters. **⋯** also offers **Disable for 5
minutes**, **15 minutes**, **1 hour** or **until browser restart**; the rule then shows
`Disabled until …`, is skipped by routing and the tester, and keeps its Enabled switch. **Re-enable
now** ends it early. Temporary disables last only for the browser session and are not exported. Select rules to enable, disable or
delete them together. The editor opens in a centered dialog with **Rule**, **Test** (pattern tester) and **Notes** tabs.

Rules have one global numeric priority. The first enabled, compatible, non-expired match wins.
Rules are evaluated strictly in their displayed global order. Categories and hidden specificity
tie-breakers are not used.

Origin Rules match normalized `scheme://hostname[:explicit-port]/` and work in all targets. Full
URL Rules include path/query without fragment and work only in Firefox. Use the template generator
and local tester before saving. When search or a filter is active, reordering is disabled to avoid
changing a hidden global order.

Every rule requires an explicit **Route via** selection: **Direct connection** or one existing
proxy profile. For example, choose the **Domain suffixes** template, enter `.ru, .рф`, generate the
editable pattern, and select `Proxy · Proxy 1`; a second `.de` rule can select `Proxy · Proxy 2`.
Suffixes are matched only at the end of normalized hostnames, and internationalized suffixes are
converted to Punycode locally. This is an explicit suffix list, not an automatic country database.

For a faster start, **Russian Sites example** fills `.ru`, `.рф`, and `.su`. **Social Networks
example** fills the main and common supporting domains for VK, OK, Facebook, Instagram, Threads,
X/Twitter, TikTok, LinkedIn, Reddit, Pinterest, Snapchat, Telegram, Discord, and YouTube. Both
examples fill the rule name, description, local test URLs, and an editable expression. They never
select **Route via** or save themselves; review the generated list and choose the intended route.

Rules apply in both PROXY and RULES modes. When no rule matches, PROXY uses the selected global
profile and RULES goes direct. A rule assigned to an unavailable proxy never falls back to direct
or another proxy.

## 4. Current-site actions

The popup starts with the current site: its hostname, the route it takes (Direct or the proxy
profile) and what decided it — the global mode, a Once override, the matching rule by name, or no
matching rule. Below are the site's Once overrides and the site actions, then the global mode with
a one-line explanation, the global proxy with its last check and **Copy URL**, and links to
Settings and Logs. For a site action choose Exact hostname or Domain + subdomains and a route
(Direct or a profile):

- **Once** creates session-only state above rules.
- **Always** previews and creates a permanent Origin Rule.

Firefox Once is tab-scoped when the request has a reliable tab ID. Chromium PAC has no tab ID, so
Once may affect other tabs on that origin until the source tab closes. The UI displays this warning
before confirmation.

Both actions open an in-page preview with the generated pattern before anything is created.

### Managing Once overrides

Settings → **Temporary overrides** lists every active Once override of the current session with its
site, scope, route, the tabs it applies to, the source tab and when it was created. For each one
you can:

- **Edit** the scope (exact hostname or domain + subdomains, in both directions) and the route,
  with a live preview of the generated pattern;
- **Make permanent**, which adds an equivalent Origin Rule at the top of the rule list and then
  removes the override;
- **Remove** it.

The popup also shows the Once overrides that cover the current site, including ones created in
another tab (Chromium), with a route selector, **Make permanent** and **Remove**. When the current
tab already has a Once override, the **Once** button reads **Update Once** and replaces it.

**Clear all** removes every override of the session. Overrides created in a private window are not
shown on the normal settings page; manage them from the popup of a private window. When a proxy
profile is deleted, Once overrides that used it are removed and counted in About / Diagnostics.

## Confirmations

Deleting a profile or rule, clearing logs, and replacing the configuration ask for confirmation in
an in-page dialog that shows the impact. Turn off **Confirm destructive actions** in General
settings to skip these questions. Privacy disclosures, such as the external request of a manual
proxy check or a credential export, are always shown.

## 5. Diagnostics and recovery

The badge shows `D`, the profile short name, `R`, or `!`. Popup and badge use the same resolver
inspection. The best-effort error page is limited to supported main-frame proxy failures. General
settings includes **Show ProxyLoom error page**; turn it off to keep the browser's native error page
and prevent creation of error recovery context. When enabled, the page shows a clickable safe origin
without credentials, path, query, or fragment. Clicking it or **Retry** repeats the exact original
address once. **Open Directly Once** is explicit recovery; background/WebSocket/download errors never
redirect an arbitrary tab. Chromium speculative or cached page loads (including search-result
preloading) also stay in the background and cannot replace the visible search tab. The Retry target
remains available for five minutes while you switch between DIRECT and PROXY, even if the MV3
background worker stops in between. Retry is one-time; closing the source tab or restarting the
browser discards it.

On Chromium-family browsers, authenticated proxy recovery waits up to ten seconds for a cold MV3
worker to restore and verify its applied routing snapshot. Cleanup of unrelated tab error contexts
does not block this authentication path. If a vendor browser still reports a transient timeout for
a restored/discarded tab, **Retry** repeats the original URL through the same fail-closed route.

Routing Logs are local, bounded to 1000 persistent entries, filterable, pausable, and clearable.
Private entries remain in memory. About / Diagnostics can copy a safe snapshot without URLs,
credentials, logs, or private state.

## 6. Import and export

### Proxies from text

**Proxies → Import from text** (also on **Import & Export**) accepts one proxy per line, pasted or
loaded from a `.txt`/`.csv` file up to 1 MiB and 1000 records. Lines starting with `#` or `//`
are ignored. Supported forms include `http://user:pass@host:port`, `https://host:port`,
`host:port`, `user:pass@host:port`, `host:port:user:pass`, `user:pass:host:port`, a protocol word
before or after the record, space-separated fields and CSV/TSV/semicolon rows; IPv6 hosts go in
brackets. Lines without a protocol use the selected default; nothing is probed over the network.
SOCKS lines are reported as unsupported.

The preview shows each line as New, Update, Unchanged, Duplicate (a later line with the same host,
port and username wins) or Error with the reason; passwords are never shown. For `a:b:c:d` lines
that are valid both ways, choose the field order. New profiles are named `host:port` and use one
endpoint for all schemes; an update changes only the password and protocol of the matching
profile. Import applies all lines at once or nothing.

### Copy and export as text

Each profile card has **Copy as** with three forms, all including the username and password:

- **URL** — `http://user:pass@host:port` (special characters in credentials are percent-encoded);
- **curl** — `curl -x 'http://user:pass@host:port' '<check URL>'`, quoted for POSIX shells;
- **host:port:user:pass** — when the credentials contain no `:`, `@`, `,`, `;` or spaces;
  otherwise the URL form is used.

A profile with separate HTTP and HTTPS endpoints produces two lines labelled `# HTTP/WS targets` and
`# HTTPS/WSS targets`. **Proxies → Copy all as URLs** copies every profile, the popup's **Copy URL**
copies the active global profile, and **Import & Export → Export proxies as text** saves a `.txt`
file in URL or `host:port:user:pass` form that **Import from text** reads back.

### Native backup

Native export includes profiles, rules, general settings, and appearance. **Include proxy
credentials** is on by default, so the file restores working profiles; a permanent warning says the
file contains passwords in plaintext. Clear it to share a file without credentials. Import validates hostile
JSON before preview, then supports merge or confirmed replace with a local recovery backup.
Older schema v1/v2 backups remain importable. Obsolete group metadata and non-useful untouched
demos are discarded. Legacy `russian.example` and `social.example` placeholders are upgraded to
the populated editable examples; user-created or edited rules retain their action and relative
global order.

FoxyProxy import accepts supported HTTP/HTTPS profiles from known 6–9 JSON variants. Patterns,
rules, subscriptions, PAC, direct, and SOCKS entries are reported but not imported.

## Appearance

Settings → **Appearance** offers the System, Light and Dark themes with previews and six accent
colors (Indigo, Teal, Violet, Rose, Amber, Slate) for buttons, links, selection and focus. Every
combination keeps text at WCAG AA contrast. The choice applies to settings, the popup and the
error page and is part of the native backup; older backups import with the Indigo accent.

## Help and tips

Settings → **Help** contains short guides to modes, proxy profiles, importing and copying proxies,
checks, rules and regular expressions, Once and Always, logs and privacy, browser differences,
troubleshooting and appearance, with a search box. Fields that often raise questions show a **?**
button: it opens a short explanation that closes with Escape and links to the matching guide
(`options.html#help/<article>`). The help is bundled with the extension and makes no network
requests.

### Writing patterns

The **?** next to **Regular expression** in the rule editor shows a cheat sheet of the most useful
building blocks with examples, and Help → **Regular expression basics** explains them in more
detail. **Flags** are two switches: **Ignore case (i)** (on by default, because hostnames are
case-insensitive) and **Multiline (m)**, which URLs never need. The **Test** tab lists every sample
URL with a Match, No match or Error badge next to it and, when the URL was normalized first, the
exact text that was tested.

## Check results

Each proxy row shows the whole result of its last check: Available or Unavailable, the response
time, and either the reason for a failure or the external IP with the country's name and flag. The
popup shows the same country next to the global proxy. Flags are bundled with the extension, so no
image is downloaded; a country value that is not a two-letter ISO code is shown as text.
