# src/lib/ - Services Layer

Backend services: database, OAuth automation, tunneling, network, MCP, and utilities. 102 JS files across 12 subdirectories.

## STRUCTURE

```
src/lib/
+-- auth/           # Session/auth helpers
+-- db/             # SQLite database layer
|   +-- adapters/   # better-sqlite3, sql.js, node:sqlite, bun:sqlite
|   +-- helpers/    # Query builders, migration runner
|   +-- migrations/ # Schema migrations
|   +-- repos/      # Data access (connections, settings, usage, etc.)
+-- mcp/            # MCP server integration
+-- merge/          # Config merge utilities
+-- network/        # Network detection, proxy config
+-- oauth/          # Bulk automation engine (27 service files)
|   +-- constants/  # Provider-specific constants
|   +-- services/   # Import managers + automation (Kiro, CodeBuddy, 5sim, etc.)
|   +-- utils/      # Browser helpers, Google login, region selection
+-- qoder/          # Qoder preview/job management
+-- tunnel/         # Tunnel providers
|   +-- cloudflare/ # Cloudflare tunnel integration
|   +-- shared/     # Common tunnel utilities
|   +-- tailscale/  # Tailscale integration
+-- updater/        # App auto-update logic
+-- usage/          # Usage tracking service
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add DB table/repo | `db/repos/` - one file per entity |
| Change DB adapter | `db/adapters/` - 4 adapters with same interface |
| Add bulk automation | `oauth/services/` - extend base manager pattern |
| Add tunnel provider | `tunnel/{name}/` - follow cloudflare/tailscale pattern |
| Token/quota tracking | `usage/` + `usageDb.js` (root of lib) |
| Proxy config for automation | `oauth/services/bulkImportProxyOptions.js` + `bulkImportProxyResolver.js` |
| Browser engine selection | `oauth/services/bulkImportBrowserEngine.js` |
| 5sim phone OTP | `oauth/services/fiveSimClient.js` |
| CodeBuddy CN automation | `oauth/services/codebuddyCnPhoneAutomation.js` + `codebuddyCnPhoneImportManager.js` |

## CONVENTIONS

- **Dual SQLite strategy** - `better-sqlite3` (native) preferred, `sql.js` (WASM) fallback
- **Singleton managers** - `globalThis.__*Singleton` pattern for import managers
- **Browser automation** - Playwright-based (Chromium default, `camoufox-js` optional stealth); cascades to manual assist on captcha
- **`onStep?.(step, message)`** - real-time UI reporting from automation workers
- **`persistJobSnapshot`** - immediate DB writes during automation for crash recovery
- **Access key naming** - `9router-${email_prefix}-${timestamp}` capped at 50 chars
- **SOCKS proxy cascade** - 5sim and CodeBuddy CN route through SOCKS proxies

## ANTI-PATTERNS

- Never deduplicate access tokens automatically (users manage)
- Never skip `registerAll.js` import when testing translators
- Automation must handle `failed_restricted` gracefully (replay with active session)
- DB adapters must expose identical interface regardless of backend
