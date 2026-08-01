# Final release audit

Date: 2026-08-01
Current disposition: **NOT RELEASE APPROVED**

## Automated candidate status

- Strict typecheck, lint and formatting: pass.
- A clean temporary Git snapshot with no dependencies/build output was cloned and passed frozen
  install, the complete regression/package sequence and a zero-diff post-run check.
- The final current-tree repetition in an isolated clean repository passed all 38 E2E tests and
  every package gate with an empty post-run Git status.
- Unit, parity, performance, local integration and Chromium extension E2E: pass on the recorded
  candidate state.
- Chromium and Firefox MV3 builds, manifest/CSP validation and artifact secret scan: available as
  reproducible commands.
- Both target manifests require `options_ui.open_in_tab: true`, and Chromium E2E verifies that
  Settings opens as a standalone extension tab rather than an extensions-page dialog.
- Google Chrome 150.0.7871.128 Official Stable passed clean-profile GUI sideload, core UI,
  `chrome.proxy` ownership and real incognito-window lifecycle smoke; this is recorded evidence,
  not the release owner's signed PL-121 matrix.
- Yandex Browser 26.4.1.1110 stable passed clean-profile GUI sideload, core UI, mandatory PAC
  ownership and DIRECT restoration smoke; its full PL-123 matrix remains unsigned.
- Microsoft Edge 150.0.4078.99 Stable passed clean-profile GUI sideload, Options/Popup state,
  mandatory PAC ownership, regular and real InPrivate proxy routing, private-memory log isolation,
  extension-storage canary scan and DIRECT restoration.
- Official Mozilla Firefox 153.0 Stable passed a clean temporary-profile, headed full-product
  smoke from the final Firefox production build: Add-ons/Options/Popup, profile creation, real
  regular/private request-time proxy routing, a 70-second MV3 idle-wake check, private in-memory
  log isolation, extension-storage canary scan and DIRECT restoration.
- Firefox 153 automated API runs additionally passed browser-manual fallback semantics, MV3 reload,
  real second-extension precedence/no-fight/recovery and a locked enterprise Proxy policy.
- The Firefox Stable run found and fixed late MV3 event-listener registration. The Edge Stable run
  found and fixed Chromium private-log classification when `webRequest` omits `incognito`.
  Focused regression tests and repeated branded-browser runs cover both defects.
- Machine-checked traceability covers all 125 tasks and all 150 PRD requirement identifiers.
- Schema v2 removes rule groups from storage, import/export and UI. The v1 migration and native
  import compatibility discard obsolete group metadata and untouched built-in demos while
  preserving user-created or edited rules, actions and relative global order; fresh installs start
  with an empty rule list.
- Dependency audit: no known vulnerabilities.
- Privacy, permission, PAC/regex and import/storage engineering reviews: completed and recorded
  under `docs/security/`, including branded-browser console/network/storage canary inspection.
- Chromium 151 and Firefox 153 permission-warning formatters were exercised against the complete
  target manifests; the reviewed English warning sets are recorded and Chromium is a release gate.
- English README, user guide, privacy disclosure, store copy, permission rationale and
  dimension-validated candidate listing assets: present.
- About/Diagnostics accepts centralized public support/privacy HTTPS URLs and rejects credentials,
  fragments or insecure schemes; this candidate omits both links instead of inventing placeholders.
- Public provider/store policy documentation was rechecked on 2026-07-26. The default provider's
  live schema/CORS gate passed without recording returned IP/country values.
- The Firefox source archive now carries explicit AMO reviewer instructions and reproducibly
  generated all 20 Firefox release files with exact matching SHA-256 digests.
- Headed Chromium with Orca 46.1/AT-SPI completed a keyboard-only speech-output walkthrough. Actual
  200% browser zoom passed; a headed-only narrow-Popup overflow found by this gate was fixed and
  regression-tested.
- A five-minute Chromium memory soak completed 752 full Options/Popup cycles with zero document,
  DOM-node, listener or process-count growth; renderer heap and whole-profile PSS remained within
  their recorded budgets.
- GitHub Actions build both targets and create checksummed GitHub release artifacts only; no store
  credentials or publication action exists. The publisher locally proves first-create and
  idempotent same-release refresh paths, rejects draft/prerelease collisions, downloads the
  published assets and verifies their portable SHA-256 manifest.
- A clean local repository tagged `v0.1.0` completed the release build/package/checksum/source
  rebuild dry-run with an empty post-run Git status. Creating and retrying the hosted GitHub
  Release remains PL-112.

## Release blockers

1. PL-107 and PL-108 require hosted GitHub pass/fail runs. This workspace has no configured remote
   and its GitHub CLI authentication is invalid, so a local workflow parser cannot claim them.
2. PL-112 still requires a real hosted tag, one GitHub Release and a repeated hosted run. Its
   create/refresh/failure/download verification paths are locally regression-tested, but this
   workspace deliberately cannot substitute those tests for the external GitHub action.
3. PL-115 and PL-116 require final brand/legal ownership, a real Firefox extension ID, public
   support/privacy URLs and authenticated store-portal validation. Placeholder IDs or invented
   URLs are not acceptable.
4. PL-121…PL-123 require release-owner-signed Chrome, Firefox, Edge and Yandex package matrices
   beyond the completed branded-browser smokes.
5. PL-124 requires human release-owner approval after all preceding external gates.

The repository is therefore an extensively tested release candidate, not a store-ready approved
release. This status must not be changed merely because automated CI is green.
