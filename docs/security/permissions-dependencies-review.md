# Permissions, CSP and dependency review

Date: 2026-07-26  
Scope: PL-119, both MV3 manifests, production bundles, lockfile and production licenses.

## Result

`pnpm audit` reports **no known vulnerabilities** after exact root overrides for patched
transitive development-tool versions. Both build manifests pass the automated target diff and CSP
checks. No remote code or dynamic-code constructor was found in release output.

## Permission traceability

| Permission                          | Product use                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `proxy`                             | Apply/read deterministic browser proxy configuration                            |
| `storage`                           | Versioned configuration and session state                                       |
| `tabs`                              | Current-tab inspection, badge, cleanup and best-effort error page               |
| `webRequest`                        | Redacted diagnostics and error/auth correlation                                 |
| `webRequestAuthProvider` (Chromium) | One-attempt proxy authentication                                                |
| `webRequestBlocking` (Firefox)      | Per-request routing and proxy authentication                                    |
| `alarms`                            | Expiry/reconciliation after worker suspension                                   |
| `downloads` + `notifications`       | Redacted download-failure notification                                          |
| `scripting`                         | Read bounded JSON from the temporary inactive check tab after an explicit Check |
| `<all_urls>`                        | Route and observe supported HTTP/HTTPS/WS/WSS requests                          |

The `scripting` path is not a general content script: it runs only in an extension-created inactive
tab, reads the response body, then closes the tab and restores the prior proxy snapshot.

## Build controls

- MV3, default locale, target-specific auth permission and required routing permissions are
  validated for both outputs.
- CSP is `script-src 'self'; object-src 'self'`; `unsafe-eval` and `unsafe-inline` are rejected.
- Release scanning rejects `eval(`, `new Function(` and credential/path canaries.
- Frozen lockfile install, audit and production license enumeration are CI/release gates.
- Production license groups observed: MIT, ISC, BSD-2-Clause, BSD-3-Clause and Apache-2.0.

## Dependency overrides

The lockfile pins patched transitive versions of `adm-zip`, `brace-expansion`, `esbuild`,
`shell-quote`, `tmp` and `uuid`. Full quality, integration, Chromium E2E and dual builds are rerun
after these overrides; they are not audit suppressions.

## Permission-warning capture

The release manifests were evaluated in English rather than inferring warning text from permission
names:

- Playwright Chromium 151 called
  `chrome.management.getPermissionWarningsByManifest()` for each complete built manifest. Both
  targets returned `Read and change all your data on all websites`, `Display notifications`, and
  `Manage your downloads`. The API does not require adding the `management` permission. The
  reproducible `pnpm validate:permission-warnings` gate now fails when this reviewed list changes
  and is part of the tag-release workflow.
- Official Firefox 153 temporarily installed the exact Firefox ZIP in a clean headless WebDriver
  profile. Firefox's current `ExtensionData.formatPermissionStrings()` install-prompt formatter
  returned `Access your data for all websites`, `Download files and read and modify the browser’s
download history`, `Display notifications to you`, `Control browser proxy settings`, and
  `Access browser tabs`. Its separate data-collection statement was `The developer says this
extension doesn’t require data collection.` The temporary add-on, profile and driver session
  were removed after capture.

## Residual risk

The broad host permission and proxy APIs are inherently powerful and produce strong browser
install warnings. They are required by the single purpose of the extension. Authenticated store
upload portals can apply additional review policy or later browser wording, so the release owner
must recheck those external results under PL-115 without changing this completed engineering
review.
