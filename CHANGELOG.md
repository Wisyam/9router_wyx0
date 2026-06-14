# v0.4.85 (2026-06-14)

## Release Highlights
- [NEW] CodeBuddy bulk-import sekarang support 3 format token: access only, access + refresh, dan access + refresh + API key (365 hari)
- [NEW] Pilih browser engine di bulk-import: Chromium (default) atau Camoufox (stealth Firefox)
- [NEW] Donate modal baru via Paymenku — 5 nominal preset (Rp 10k–250k), bayar QRIS/VA/E-Wallet
- [NEW] Auto-announce changelog ke Discord setiap version bump
- [FIX] Build error "Module not found: better-sqlite3" di Linux/CI sudah clear — install di GitHub Actions tidak fail lagi
- [FIX] Auto-install Playwright Chromium saat first bulk-import — no more "Executable doesn't exist" untuk user yang baru `npm install -g wyxrouter`
- [FIX] Bulk login akun Google Workspace (custom domain) tidak stuck lagi di consent "Welcome to your new account"

## Bulk Token Import — Flexible Formats (PR #6 by Tentoxa)
- `/api/oauth/codebuddy/bulk-token` now accepts three line formats: `accessToken` (24h OAuth-only, backward compatible), `accessToken:refreshToken` (auto-refresh enabled), and `accessToken:refreshToken:apiKey` (365-day API-key path).
- Smart JWT validation by structural check (presence of dots) — no false positives on valid JWTs, rejects malformed lines early.
- Format counts returned in the API response so the dashboard can show how many entries used each path.
- Connections imported with `apiKey` set use it as the primary credential for chat requests; the OAuth `accessToken` is still kept for upstream quota lookups.

# v0.4.84-1 (2026-06-14)

## Hotfix — Donate Tier Mapping
- Corrected the Paymenku tier list: every amount was paired with the link code one slot below it (Rp 10k pointed at the Rp 250k link, Rp 250k at Rp 100k, etc.). Verified codes against the merchant dashboard and re-aligned each tier with its real Payment Link.

# v0.4.84 (2026-06-14)

## Donate via Paymenku
- Replaced the legacy donate modal (which fetched a JSON channel list from upstream 9router.com) with a Paymenku Payment Link picker. Five fixed-amount tiers are exposed: Rp 10k / 25k / 50k / 100k / 250k.
- Each button opens the corresponding Paymenku Payment Link in a new tab — payment supports QRIS, Virtual Account, and E-Wallet at Paymenku's checkout page.
- Removed `GITHUB_CONFIG.donateUrl` and the QR-card render path. Paymenku tier list lives in `shared/constants/config.js` (`PAYMENKU_DONATE_TIERS`) for easy editing.

## Build Fix — Optional Native Dependencies
- Fixed `Module not found: Can't resolve 'better-sqlite3'` build failure that hit Linux CI runners (and any environment without native build tools, where `optionalDependencies` install is silently skipped).
- `next.config.mjs` now registers a webpack externals callback for `better-sqlite3` and `camoufox-js`, plus an extended `serverExternalPackages` list covering both packages and `playwright` / `playwright-core`. The bundler emits `commonjs` requires without resolving the path, so a missing optional package no longer breaks `next build`.
- Adapter / route loaders swapped static imports for `createRequire(import.meta.url)` lazy resolution. Runtime still surfaces a clean `MODULE_NOT_FOUND` if the package is genuinely needed but absent.

## Bulk Import Browser Engine Selection
- Added a Browser Engine dropdown to the bulk-import modal: **Chromium (default)** or **Camoufox (stealth Firefox)**. The job carries the engine choice all the way to the launcher, and the UI persists nothing extra — pick at start time per job.
- Camoufox is shipped via `optionalDependencies` so users on locked-down npm registries don't fail `npm install -g wyxrouter`. The package and its ~150MB Firefox binary install lazily into the user's data dir on first Camoufox-engine job, mirroring the sqlite/playwright runtime pattern.
- Both engine paths now route through `bulkImportBrowserEngine.js`, which wraps `ensurePlaywrightRuntime` + `ensureCamoufoxRuntime` and converts every install/missing-binary failure into an actionable error string ("Run X manually, then retry. You can also switch back to the Chromium engine."). The job error propagates to every queued account so the modal renders it instead of silently sitting on a blank Live Browser Preview.

## Hotfix — Auto-install Playwright Chromium on First Bulk Import
- Fixed `browserType.launch: Executable doesn't exist at .../chrome-headless-shell.exe` error that hit users right after `npm install -g wyxrouter`.
- Playwright doesn't ship a Chromium binary by default through npm global installs; the package-level postinstall has to download it. We now do that lazily on the first bulk-import attempt instead of eagerly at install time so users who never touch automation aren't billed ~150MB of disk.
- Added `cli/hooks/playwrightRuntime.js` mirroring the existing sqlite runtime helper. The helper also lazy-installs the `playwright` npm package itself into the user data dir if it's missing, so a failed `npm install -g wyxrouter --omit=optional` doesn't leave the worker with no engine at all.
- Affects Kiro / Qoder / CodeBuddy bulk-import managers (they all share the same launcher path).

# v0.4.83 (2026-06-14)

## Hotfix — Workspace Welcome Click Reliability
- Added `#confirm` and `form#tos_form input[type="submit"]` to the approve selector list (Google's speedbump form uses these stable identifiers).
- When Playwright's click is rejected because the input fails the visibility heuristic, fall back to a DOM-level `scrollIntoView + click` via `page.evaluate`, then to `form.submit()` as a last resort.
- Fixes residual cases where v0.4.82 detected the Workspace welcome page but couldn't actuate the "Saya mengerti" / "I understand" submit input.

# v0.4.82 (2026-06-14)

## Hotfix — Bulk Login Stuck on Google Workspace Welcome
- Fixed bulk-import workers getting stuck in an infinite "polling token / waiting for next screen" loop when a Google Workspace account (`@custom-domain.com`) hits the "Welcome to your new account" consent screen.
- The screen has only one valid action (the primary "I understand" button) and no skip option. The previous handler tried `Skip / Not now / No thanks` selectors first, found none, and never fell through to the primary action because subsequent loop iterations re-raced with the polling promise.
- Added a Workspace-specific marker check that prioritises the primary action selector for that screen, so the worker clicks "I understand" on the first iteration that detects the page.
- Affects Kiro, Qoder, and CodeBuddy bulk-import flows (they all share the Google automation path).

# Unreleased

## Qoder Plan Awareness
- Executor now refuses pre-flight when the requested model has `enable: false` for the connected account, returning HTTP 403 with a pricing URL hint instead of letting the upstream return a generic `code: 112` error.
- Free-plan Qoder accounts effectively only get `qmodel_latest` (Qwen3.7-Max) enabled; every other catalog key (`auto`, `ultimate`, `performance`, `efficient`, `qmodel`, `dmodel`, `dfmodel`, `gm51model`, `kmodel`, `mmodel`) reports `enable: false` and 403s server-side.
- Bulk-import progress message renamed from "Checking plan & activating trial" to "Reading plan tier" — Qoder web has no Pro Trial activation flow, so the previous wording was misleading.

## Provider Bulk Delete
- Replaced the "Delete Terminal" button on the provider detail page with "Delete Selected".
- The new bulk action removes every checkbox-selected connection regardless of status — active, rate-limited, cooldown, connection-error, and terminal accounts are all eligible.
- Users can now multi-select connections via the existing row checkboxes ("Select visible" toggle still works) and delete them in one click.

## Bulk Import Manual Session
- "Open Manual Session" now actually opens a visible browser window. Bulk-import workers run headless by default; when a worker stalls on CAPTCHA / 2FA / recovery prompts and is marked `needs_manual`, clicking the button launches a fresh headed Chromium with the same cookies and storage state and navigates to the last URL the headless context was on.
- Affects Kiro, Qoder, and CodeBuddy bulk-import managers.
- The headed browser is closed automatically once the polling promise resolves (success, failure, or cancel), so no leaked windows after the followup completes.
- Fallback: if relaunching the headed browser fails (e.g. Playwright cannot spawn), the code reverts to the previous `bringToFront` / `setWindowBounds` behavior so the click is never silently a no-op.

# v0.4.81 (2026-06-14)

## Qoder Auto Login
- Added Qoder bulk auto-login via Google SSO and device flow (PKCE + poll).
- New automation panel in Dashboard → Automation with bulk account and device OAuth options.
- API routes: `/api/oauth/qoder/bulk-import` with job tracking, cancel, and manual session support.
- Reuses the same Google SSO automation engine as Kiro and CodeBuddy.

## Bulk Account Normalization
- `parseKiroBulkAccounts` now supports multiple separators: `email:password`, `email|password`, and tab-separated.
- Lines starting with `#` are treated as comments and skipped.
- Colon separator only activates when the part before `:` contains `@` (prevents false splits on passwords with colons).
- Updated UI placeholder and help text to reflect new format support.

## Auto-Disable on Terminal Auth Errors
- Accounts that receive 3 consecutive terminal auth errors (token expired, banned, quota exhausted) are automatically disabled (`isActive: false`).
- New fields: `autoDisabledAt`, `autoDisabledReason`, `consecutiveAuthFailures`.
- Failure counter resets on successful requests.
- Dashboard shows auto-disable reason and date; re-enabling clears the auto-disable state.

## Proxy for Login
- Browser automation (Playwright) now accepts proxy configuration via the bulk import manager.
- Qoder bulk import manager supports `proxyUrl` for HTTP/SOCKS proxy passthrough to Playwright.

## Code Structure
- Extracted `googleAutomation.js` and `codebuddyAutomation.js` as re-export modules for cleaner imports.
- CodeBuddy bulk import manager now imports from dedicated modules instead of `kiroGoogleAutomation.js`.

---

# Unreleased

## Automation
- CodeBuddy bulk automation now continues from Google login and onboarding through Access Key creation.
- A worker is successful only after the generated Access Key is saved to the provider connection.
- Existing Access Keys are reused to avoid duplicate key creation.
- Restricted pages no longer trigger an immediate skip; automation attempts key creation with the authenticated browser session and records the upstream API result.
- Added explicit states for invalid key sessions, key limits, duplicate key-name retry, and missing key secrets.

## CodeBuddy
- Generated Access Keys are the primary credential for chat/model calls.
- OAuth tokens, web session metadata, `uid`, and enterprise identity are retained in the same connection.
- Upstream quota is queried only with a valid IDE OAuth access token plus `uid`/enterprise identity headers.
- Restricted/generated-key sessions no longer retry quota through stale web cookies after OAuth rejection.
- When upstream quota authentication is unavailable, Quota Tracker reports the limitation and directs users to 9router Usage for locally observed request/token tracking.

## Distribution
- Synced the root npm package and CLI package at `0.4.78`.
- Removed the legacy `9router` CLI binary alias so npm installs expose only `wyxrouter`.
- Documented `npx wyxrouter`, global npm installation, source development, and CLI bundle packaging.

# v0.4.71 (2026-06-06)

## Features
- Caveman: add wenyan classical Chinese levels and sync upstream prompts; locale-based visibility on endpoint page
- i18n: endpoint exposure notice across multiple languages + Russian README
- Antigravity: add gemini-3.5-flash-extra-low (Low) model
- xiaomi-tokenplan: add Claude-native MiMo V2.5 Pro alias via dedicated executor
- Qoder: fetch latest model + dashboard import-model button (#1642)
- MiniMax: add MiniMax-M3 + update Quota Tracker coding/CN (#1631)

## Fixes
- Codex: harden streaming timeouts (stall/connect raised to 60s, configurable per-provider), accept `response.done` event, and always emit a terminal `response.failed` + `[DONE]` for Responses passthrough when a stream closes, stalls, or aborts before a terminal event — prevents codex clients from hanging (#1648, #1680, #1688, #1618)
- Codex: durable OAuth refresh lifecycle (#1664)
- Tunnel: skip virtual interfaces to prevent false netchange watchdog
- Claude: fix forced tool_choice 400 on cc/ OAuth route (#1592)
- Proxy: raise Next client body limit to 128MB via `NINEROUTER_PROXY_CLIENT_MAX_BODY_SIZE` (#1529, #1572)
- MiniMax: echo `reasoning_content` on follow-up turns to avoid 400 (#1543)
- Kiro: handle 400 on tool-bearing history without client tools; add mappable "auto" model slot; fix binary EventStream crash + add models & TTS tool filtering
- Antigravity: passthrough tab-autocomplete + mark default agent slot mandatory
- Qoder: allow `qmodel_latest` model key (#1638)
- Providers: restore one-connection guard for compatible/embedding nodes
- Model-test: route image/STT probes to their real endpoints, harden STT ping; add opencode-go + xiaomi-tokenplan to connection test (#1576, #1628)

## Improvements
- Dashboard: reorganize menu actions across sidebar/header/profile
- Translator: add data-driven coverage, bug-exposing cases, and real provider smoke tests

# v0.4.66 (2026-05-29)

## Features
- Add Qoder provider: device-flow OAuth, COSY signing, WAF-bypass body encoding, live model catalog, dashboard quota tracker, 11 models (#1372)
- Add new models: Claude Opus 4.8 (Claude Code), GPT 5.4 Mini (Codex)

## Fixes
- DeepSeek thinking mode: echo `reasoning_content` back on follow-up/tool-call turns so OpenCode-free and custom providers no longer 400 with "reasoning_content must be passed back" (#1543)
- Reasoning injector: match deepseek/kimi model ids case-insensitively (covers custom providers using capitalized model names)
- OpenCode suggested-models: include free models without the `-free` suffix, e.g. `big-pickle` (#1535)

## Improvements
- Codex: trim sunset models, keep gpt-5.5 / gpt-5.4 / gpt-5.3-codex family, add gpt-5.4-mini
- volcengine-ark: refresh model list (add DeepSeek-V4-Flash/Pro, drop EOL entries)
- Lower stream stall timeout 35s → 30s for faster hang detection

# v0.4.63 (2026-05-26)

## Fixes
- GitHub Copilot: never route Gemini/Claude models to the `/responses` endpoint; prevents misleading "does not support Responses API" 400s (#1062)
- proxyFetch: restore missing `Readable` import causing runtime `ReferenceError` in DNS-bypass fetch path

## Improvements
- Lower stream stall timeout from 60s → 35s for faster hang detection

# v0.4.62 (2026-05-26)

## Fixes
- Codex: auto-retry when upstream drops mid-stream (no more hangs)
- Codex: fix random 400/404 errors, tool-calling failures, and unstable prompt cache
- MITM: support Antigravity 2.x 
- Sanitize Read tool args to prevent retry loops from non-Anthropic models (#1144)
- Implement json_schema fallback for OpenAI-compatible providers without native Structured Output (#1343)
- Strip empty Read pages argument in OpenAI-to-Claude translator (#1354)
- Forward Gemini output dimensions for embeddings (#1366)
- Resolve setState-in-effect errors in dashboard components (#1362)
- Gemini CLI: reuse stored OAuth project IDs for quota checks and show clearer setup guidance when the project is missing (#1271, #1428)

## Features
- Add Cloudflare Workers proxy deployer and pool integration (#1360)
- Add Deno Deploy relays support and improved proxy pools dashboard layout (#1437)

## Improvements
- Refactor Tunnel into dedicated Cloudflare and Tailscale manager modules
- Refactor tokenRefresh service with in-flight dedup to prevent refresh_token_reused errors

# v0.4.59 (2026-05-21)

## Fixes
- OAuth: fix login flow on Windows

# v0.4.58 (2026-05-21)

## Features
- xAI Grok provider (OAuth, API key, image)
- Provider limits: paginated accounts with page size controls

## Fixes
- Tailscale: fix connection status on Windows (#1300)
- Tunnel: fix false "checking" when tunnel URL is reachable
- Stream: fix pipe errors on client disconnect/abort

# v0.4.55 (2026-05-18)

## Features
- Xiaomi MiMo Token Plan: region selector (Singapore / China / Europe) — keys are cluster-specific
- Antigravity: risk confirmation dialog before first connection
- Gemini CLI: surface upstream retry delay on 429 errors

## Fixes
- MITM: cannot kill process on macOS under sudo (lsof not found in PATH)
- Stream: false-positive stall timeout on Claude reasoning / Kiro responses
- Tunnel: cannot re-enable after disable (stuck state)
- Tunnel: cloudflared error messages now include log tail for easier debugging
- Language switcher: applies selected locale immediately on close (#1234)
- Antigravity OAuth: metadata now matches the official client

## Improvements
- Gemini CLI: bump engine to 0.34.0
- Re-hide `qwen` (OAuth EOL) and `iflow` (not ready) providers

# v0.4.52 (2026-05-17)

## Features
- Add Vercel AI Gateway provider support (#1183)
- rtk: Kiro format tool result compression — handle conversationState.history & currentMessage, preserve error results, ~13.6% savings (#1194)

## Fixes
- openclaw: normalize agent.model object form `{primary, fallbacks}` before .startsWith → fix TypeError & 'not configured' status (#1216)
- Usage Details pagination: stay inside mobile viewport <640px (#1218)
- Fix test model error
- Fix MIMO provider in Codex
- Disable log file creation when using MITM AG

# v0.4.50 (2026-05-16)

## Fixes
- Fix duplicate tray icon on macOS when hiding to tray
- Fix tray not showing in background mode on macOS
- Fix hide to tray broken on Windows/Linux
- Fix Shutdown button in web UI not working

# v0.4.49 (2026-05-16)

## Features
- Add Kiro provider support: full request/response translation, live model listing, reasoning content support
- Add `buildOutput` RTK filter with autodetect for npm/yarn/cargo build logs
- Add MITM warning notification in tray and dashboard

## Improvements
- Add modalities (input/output) to model configuration for OpenCode
- Fix tray hide-to-tray: keep current process alive instead of spawning detached child (fixes macOS NSStatusItem ghost icon)
- Fix tray kill: graceful shutdown with SIGTERM/SIGKILL escalation
- Fix SIGHUP handling so macOS terminal close doesn't kill tray process
- Hide deprecated providers (qwen, iflow, antigravity)
- Update i18n across 32 languages

## Fixes
- Fix model check (test-models) blocked by dashboardGuard: pass machineId-based CLI token in internal self-calls

# v0.4.46 (2026-05-15)

## Breaking Changes
- Tunnel public URL changed — old tunnel links no longer work, please reconnect to get the new URL

# v0.4.44 (2026-05-15)

## Features
- Add Blackbox provider with `bb` alias (#1143)
- Add Xiaomi token plan provider
- Enhance model select modal UX + modal traffic lights (#1111)
- Default Usage dashboard period to Today (#1141)

## Fixes
- Fix Cowork model selection and Windows CLI packaging (#1129)
- Update provider name retrieval for compatibility provider (#1135)
- Update JWT_SECRET handling

# v0.4.41 (2026-05-14)

## Features
- Add jcode CLI tool integration with auto-configuration (#1047)
- Redesign CLI Tools dashboard: grid layout (1/2/3 cols) + dedicated detail page per tool
- Add drag-and-drop reordering for combo models (#1108)
- Add Today period option to Usage & Analytics (#1063)
- Add DeepSeek V4 Pro effort aliases (#950)

## Fixes
- fix(autostart): work on nvm + npm 9/10, actually register with launchctl (#1104, fixes #1082)
- Fix Ollama usage not tracked/shown in UI (#1102)
- fix(opencode): preserve DeepSeek reasoning content (#1099, fixes #1093)
- Fix TUI input lag (replace enquirer with native readline, persistent raw mode)
- fix(ui): show API key row actions on mobile (#1112)

## Improvements
- Sync DeepSeek TUI card style with other CLI tools (badges, layout, manual config modal)
- Add official logos for Amp CLI, jcode, Qwen Code (replace generic icons)
- Resize deepseek-tui icon 1024→128 with padding for visual consistency

# v0.4.39 (2026-05-14)

## Fixes
- fix(docker): restore `/app/server.js` (v0.4.38 regression)

# v0.4.38 (2026-05-13)

## Features
- Add DeepSeek TUI as CLI tool in dashboard (#1088)

## Fixes
- Fix broken Docker image in v0.4.36/v0.4.37 (#1096, #1097)

## Improvements
- Clean Docker tags + clearer pulls badge

# v0.4.37 (2026-05-13)

## Improvements
- Security hardening — upgrade recommended

# v0.4.36 (2026-05-13)

## Features
- Add MiniMax TTS provider support (#1043)
- Docker images now published on both Docker Hub (`decolua/9router`) and GHCR — pull from your preferred registry

## Improvements
- Replace browser confirm dialogs with custom ConfirmModal (#1060)

## Fixes
- Fix Docker `Cannot find module 'next'` error in standalone build
- Restore /app/server.js in Docker standalone build (#1064, #1067)
- Fix CLI TUI menu arrow-key escape sequences leaking (^[[A^[[B)
- Switch macOS/Linux tray to systray2 fork (fixes Kaspersky AV false-positive) (#1080)
- Fix zoom controls contrast in topology view (#1066)
