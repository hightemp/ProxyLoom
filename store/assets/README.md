# Store assets

`public/icon.svg` is the editable vector source. Deterministic 16, 32, 48 and 128 pixel PNG
derivatives are committed under `public/` and declared for the extension and toolbar action in
both manifests. Regenerate them with ImageMagick from the SVG source, then validate exact
dimensions with `identify`.

The committed store candidates are:

- `logo-300.png`: Edge-compatible square listing logo (300×300 recommended, 128×128 minimum).
- `promo-small-440x280.png`: Chrome-required/Edge-compatible small promotional tile.
- `options-general-1280x800.png`: Chrome/Edge-compatible product screenshot.

These dimensions were rechecked on 2026-07-26 against the official
[Chrome Web Store image requirements](https://developer.chrome.com/docs/webstore/images) and
[Microsoft Edge publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).
The packaged 128×128 extension icon is the Chrome listing icon.

Regenerate the screenshot from a built release candidate with `pnpm capture:store-assets`.
Regenerate the vector-derived PNGs with:

```bash
convert public/icon.svg -resize 300x300 store/assets/logo-300.png
convert store/assets/promo-small-440x280.svg store/assets/promo-small-440x280.png
pnpm validate:store-assets
```

Do not capture real credentials, browsing history, private tabs, paths, queries, logs, IP
addresses, or provider responses. Authenticated portal validation and any changed listing policy
must still be checked by the release owner at upload time.
