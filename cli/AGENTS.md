# cli/ - Standalone CLI Package

Global npm package (`wyxrouter`) that bundles the Next.js dashboard + SSE engine into a single installable CLI with system tray, port management, and self-healing dependencies. 40 JS files.

## STRUCTURE

```
cli/
+-- cli.js              # Main entry point (bin), arg parsing, process spawn
+-- hooks/              # postinstall, sqlite/tray/playwright runtime warmup
+-- scripts/            # build-cli.js, buildMitm.js (esbuild bundling)
+-- app/                # Bundled production Next.js standalone output
|   +-- server.js       # Standalone Next.js server with inline config
|   +-- public/         # Static assets (icons, providers, i18n)
|   +-- src/            # Bundled source subset (mitm, db, oauth)
+-- src/cli/            # CLI-specific code
    +-- api/            # Local API client
    +-- menus/          # Interactive terminal menus (providers, settings)
    +-- tray/           # System tray integration
    +-- utils/          # Port management, process helpers
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| CLI startup flow | `cli.js` - arg parsing -> port check -> spawn server |
| Add menu option | `src/cli/menus/` - one file per menu section |
| System tray | `src/cli/tray/` - platform-specific tray management |
| Build/bundle | `scripts/build-cli.js` - Next.js standalone + asset copy |
| MITM bundling | `scripts/buildMitm.js` - esbuild single-file bundle |
| Runtime deps | `hooks/sqliteRuntime.js`, `hooks/trayRuntime.js` |

## CONVENTIONS

- **Self-healing deps** - native packages installed to `~/.9router/runtime/` not `node_modules`
- **`NODE_PATH` injection** - `buildEnvWithRuntime` adds runtime dir to module resolution
- **EBUSY prevention** - runtime files copied out of global install path before use
- **Isolated build env** - `build-cli.js` sets temp HOME/APPDATA to `.build-home/`
- **Version sync** - CLI build auto-syncs version from `cli/package.json` -> root `package.json`
- **`NEXT_TRACING_ROOT_MODE`** - "workspace" for hoisted deps during build
- **Optional deps stay external** - `better-sqlite3`, `playwright`, `camoufox-js` never bundled

## ANTI-PATTERNS

- Never bundle `better-sqlite3` or `playwright` in the npm package (external/optional)
- Never assume native deps exist - always check and fallback to WASM/pure-JS
- Never hold file locks on server.js - copy to DATA_DIR first
- Legacy `systray` packages must be evicted (broken on modern OS)
