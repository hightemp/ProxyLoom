# Firefox source-code review

This archive is the matching source package for the ProxyLoom Firefox extension. The extension is
built with WXT, Vue and TypeScript, so Mozilla reviewers need this package to reproduce the
submitted files.

## Build environment

- Ubuntu 24.04 LTS or another current Linux distribution
- Node.js 22
- pnpm 10.32.1, pinned by the `packageManager` field in `package.json`
- Internet access to the public npm registry for the frozen dependency installation
- No environment variables, private registries, credentials or proprietary dependencies

The project has also been checked against Mozilla's documented Ubuntu 24.04 reviewer environment.
All runtime source and build configuration is included in this archive.

## Reproduce the Firefox build

From the extracted source-package root:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
pnpm build:firefox
```

The unpacked extension is generated at `.output/firefox-mv3/`. No generated source, downloaded
runtime code or `.env` file is required.

To compare it with an extracted submitted Firefox ZIP:

```bash
mkdir submitted-firefox
unzip /path/to/ProxyLoom-<version>-firefox.zip -d submitted-firefox
diff -ru --no-dereference .output/firefox-mv3 submitted-firefox
```

The repository release gate performs the same check automatically from the source ZIP:

```bash
pnpm validate:source-rebuild
```

That command extracts the packaged sources into a new temporary directory, performs a frozen
install and Firefox production build, compares every generated path and SHA-256 digest with the
release build, and removes the temporary directory.
