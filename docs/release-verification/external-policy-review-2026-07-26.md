# External provider and store-policy review

Date: 2026-07-26

This review records public, non-portal requirements that can change independently of the source
tree. It does not substitute for the release owner's authenticated store-dashboard review.

## Manual IP/country provider

The default endpoint remains `https://api.country.is/`.

- The [provider documentation](https://country.is/) states that the API requires no key, is open
  source/self-hostable, refreshes its data daily, applies an infrastructure limit of 10 requests
  per second per IP, and does not log requests.
- A live schema/CORS check sent a synthetic extension Origin and did not print the returned IP or
  country. It received HTTP 200, `application/json`, `Access-Control-Allow-Origin: *`, exactly the
  `country` and `ip` response keys, a syntactically valid IP, and a two-letter country code.
- The product still treats the endpoint as replaceable and user-triggered only. Provider claims
  can change, so this check remains a per-release gate.

## Chrome Web Store

The current official [image requirements](https://developer.chrome.com/docs/webstore/images)
require a 128×128 extension icon in the package, a 440×280 small promotional image, and at least
one 1280×800 or 640×400 screenshot.

The candidate contains a 128×128 packaged icon plus dimension-validated 440×280 and 1280×800
listing assets. The current [program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
continue to require the narrowest necessary permissions and accurate user-data disclosures.

## Microsoft Edge Add-ons

The current official [Edge publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
recommends a 300×300 square logo (128×128 minimum), accepts a 440×280 small tile, and accepts
1280×800 or 640×480 screenshots. It requires a 250–10,000-character full description and a privacy
policy URL when personal information is accessed, collected or transmitted.

The candidate's logo, tile and screenshot dimensions pass. Its 734-character full description is
within the documented range. A final public support/privacy URL and authenticated Partner Center
form review still require the release owner.

## Firefox Add-ons

The current official [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
accepts packages up to 200 MB and requires a privacy policy when data leaves the device. Because
WXT bundles the extension, Mozilla's
[source submission rules](https://extensionworkshop.com/documentation/publish/source-code-submission/)
require matching source code, complete build instructions and a reproducible generated package.

The Firefox install and source ZIPs are below 1 MB. The source ZIP includes
`SOURCE_CODE_REVIEW.md`, the frozen lockfile and all build inputs. `pnpm validate:source-rebuild`
extracts that archive, installs with the frozen lockfile, builds Firefox, and has reproduced all 20
release-output files with exact matching SHA-256 digests.

## Remaining authenticated boundary

The following cannot be established from public documentation:

- final product-name/trademark ownership and publisher identity;
- public support and privacy-policy URLs;
- actual Chrome, Firefox, Edge and Yandex listing IDs;
- warning copy and validation results produced by the authenticated upload portals;
- completed portal privacy questionnaires and reviewer approval.

Those values must not be invented or replaced with `*.invalid` placeholders in a submitted
package.
