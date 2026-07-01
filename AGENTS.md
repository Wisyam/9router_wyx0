# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-23
**Commit:** cb854ed9
**Branch:** master

## OVERVIEW

9Router WYx0 - local AI router/proxy that aggregates 96 providers (LLM chat, image, embedding, TTS, STT, web search) behind an OpenAI-compatible API. Next.js 16 App Router + Express-style SSE streaming engine (`open-sse/`). Ships as global npm CLI (`wyxrouter`) with embedded dashboard, MITM proxy, and Playwright-based bulk account automation.

## STRUCTURE

```
9router/
+-- open-sse/         # Core routing engine (executors, translator, RTK filters)
+-- src/
|   +-- app/          # Next.js App Router (dashboard pages + API routes)
|   +-- lib/          # Services: oauth, tunnel, db, qoder, network, mcp
|   +-- shared/       # React components, constants, hooks, utils
|   +-- mitm/         # MITM proxy manager (cert gen, hosts, port 443)
|   +-- sse/          # SSE streaming handlers and utilities
|   +-- store/        # Zustand stores (7: provider, settings, theme, etc.)
|   +-- models/       # Model definitions
|   +-- i18n/         # App-side localization
+-- cli/              # Standalone CLI package (tray, menus, bundled app)
+-- tests/            # Vitest suite (unit, translator, e2e, real)
+-- scripts/          # Build helpers (start-standalone, discord-announce)
+-- gitbook/          # Documentation site (5 languages: en/es/ja/vi/zh-CN)
+-- i18n/             # Localization literals
+-- public/           # Static assets + provider icons (96 SVG/PNG)
+-- skills/           # MCP skill packages (chat, embeddings, image, stt, tts, web)
+-- docs/             # Additional documentation
+-- images/           # Screenshots and reference images
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new AI provider | `open-sse/providers/registry/{id}.js` + `open-sse/config/providerModels.js` | Copy REGISTRY_TEMPLATE.js; tests auto-cover via matrix |
| Add executor (non-standard) | `open-sse/executors/{provider}.js` | Subclass BaseExecutor; register in `executors/index.js` |
| Add translator | `open-sse/translator/request/` or `response/` | Register via `register()`, import in `translator/index.js` |
| Add image provider | `open-sse/handlers/imageProviders/{name}.js` | Subclass `_base.js`; add to `index.js` |
| Add search provider | `open-sse/handlers/search/` | `callers.js` + `normalizers.js` pattern |
| Add RTK filter | `open-sse/rtk/filters/{tool}.js` | Register in `rtk/registry.js`; fail-open required |
| Dashboard page | `src/app/(dashboard)/dashboard/{name}/` | Next.js App Router conventions |
| API route | `src/app/api/{name}/route.js` | Next.js route handlers |
| OAuth/automation | `src/lib/oauth/services/` | 27 files - extend base manager pattern |
| Database schema | `src/lib/db/repos/` | SQLite via better-sqlite3 or sql.js |
| Token refresh | `open-sse/services/tokenRefresh.js` | Dedup cache prevents reuse attacks |
| MITM proxy | `src/mitm/manager.js` | Platform-specific elevated ops |
| CLI commands | `cli/src/cli/menus/` | Interactive menu system |
| Zustand store | `src/store/{name}Store.js` | 7 stores; `index.js` re-exports all |
| Tests | `tests/unit/` or `tests/translator/` | See `tests/AGENTS.md` |

## CONVENTIONS

- **JS only** - no TypeScript. Uses `jsconfig.json` path aliases (`@/` -> `src/`, `open-sse` -> `open-sse/`)
- **ESM imports** throughout (`import`/`export`), but translator uses `require()` internally (bundler-only)
- **Standalone output** - `next.config.mjs` sets `output: "standalone"` for CLI bundling
- **Webpack build** - `next dev/build --webpack` (Next.js 16; turbopack not used)
- **Path aliases in tests** - Vitest config at `tests/vitest.config.js` resolves `@/` and `open-sse`
- **Singleton pattern** - bulk import managers use `globalThis.__*Singleton` getters
- **Provider short aliases** - 2-letter codes (`cc`=anthropic, `gh`=github, `cb`=codebuddy) in `PROVIDER_ID_TO_ALIAS`
- **Self-healing runtime** - native deps (`better-sqlite3`, `systray2`, `playwright`) installed to `~/.9router/runtime/` at postinstall, not in `node_modules`
- **Provider registry** - `open-sse/providers/registry/{id}.js` (96 files); `registry/index.js` is auto-generated

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER rewrite entire files** - use surgical edits (apply_diff style)
- **NEVER pass string content to CommandCode** - must be array of content blocks
- **NEVER filter out tool messages** - always retain tool + assistant tool_call messages
- **NEVER route inline completion to external models** - latency-critical, use `MODEL_NO_MAP`
- **NEVER deduplicate access tokens automatically** - users manage duplicates
- **NEVER call `buildCursorRequest` twice** - double-translation drops `tool_results`
- **NEVER send Authorization header for Anthropic-Compatible** if `apiKey` present
- **NEVER hand-edit `providers/registry/index.js`** - it is auto-generated; regenerate after adding registry files
- **ALWAYS send `message_start` first** for Claude streaming responses
- **ALWAYS use `--config tests/vitest.config.js`** when running tests (alias resolution)
- **ALWAYS import `registerAll.js`** in translator tests (prevents false passes from empty registry)
- **ALWAYS make RTK filters fail-open** - any error returns null, leaves body untouched

## UNIQUE STYLES

- **`it.fails()` bug tracking** - confirmed bugs wrapped in `it.fails`; turns red when fixed -> reminder to promote to `it()`
- **Data-driven matrix tests** - `tests/translator/matrix.js` reads `PROVIDER_MODELS` directly; new providers auto-covered
- **OpenAI as intermediate format** - all translations go `source -> openai -> target` (lossy for thinking/images/audio); direct routes (`source:target`) skip the double-hop
- **RTK (Runtime Token Kompression)** - `rtk/index.js` compresses `tool_result` content in-place; `filters/` per-tool compressors (git diff, grep, ls, tree, etc.); `headroom.js` external compress proxy; `caveman.js`/`ponytail.js` system-prompt injectors
- **Dedup refresh cache** - `refreshDedupCache` with 10s TTL prevents token reuse attacks on concurrent requests
- **Runtime file copy** - MITM server.js copied to DATA_DIR to avoid EBUSY during npm updates
- **Multi-modal handlers** - 6 handler dirs: `chatCore/`, `imageProviders/`, `embeddingProviders/`, `ttsProviders/`, `search/`, `fetch/`
- **Proxy cascade** - bulk automation routes through SOCKS proxies (5sim phone OTP via `fiveSimClient.js`)

## COMMANDS

```bash
# Development
npm run dev                    # Next.js dev on :20128 (webpack)
npm run build                  # Production build (standalone, webpack)
npm run start                  # Start via scripts/start-standalone.mjs

# Bun alternative
npm run dev:bun                # Bun-powered dev
npm run build:bun              # Bun-powered build
npm run start:bun              # Bun standalone server

# Testing (from project root)
cd tests && npx vitest run --config ./vitest.config.js
cd tests && npx vitest run --config ./vitest.config.js "tests/translator/"
RUN_REAL=1 npx vitest run --config ./vitest.config.js "tests/translator/real/"
RUN_E2E=1 npx vitest run --config ./vitest.config.js

# CLI packaging (from cli/)
cd cli && npm run build        # Bundle standalone app
cd cli && npm run pack:cli     # Create .tgz
cd cli && npm run publish:cli  # Publish to npm
```

## NOTES

- **Port 20128** is the default dev/prod port
- **`/v1/*` rewrites** to `/api/v1/*` via next.config.mjs (also `/codex/*` -> `/api/v1/responses`)
- **Two SQLite strategies** - `better-sqlite3` (native, fast) with `sql.js` (WASM) fallback
- **Proxy body size** - configurable via `NINEROUTER_PROXY_CLIENT_MAX_BODY_SIZE` env (default 128mb)
- **Vitest concurrency** - `maxConcurrency: 60` for parallel provider smoke tests
- **Docker** - multi-stage build, `su-exec` privilege drop, volume permission patching in entrypoint
- **Deprecated providers** - Qwen discontinued 2026-04-15; Antigravity carries ban risk
- **`NODE_EXTRA_CA_CERTS`** - MITM sets this system-wide for other dev tools to trust 9Router CA
- **Optional stealth browser** - `camoufox-js` in optionalDependencies for bulk import; Chromium is default
- **96 provider registry** - see `open-sse/providers/registry/` for all provider definitions
- **5sim integration** - phone OTP automation for CodeBuddy CN via `src/lib/oauth/services/fiveSimClient.js`

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## FRONTEND DEVELOPMENT

**WAJIB:** Semua perubahan frontend HARUS mengikuti design system yang terdokumentasi.

### Quick Reference

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **DESIGN_SYSTEM.md** | Complete design system (colors, typography, spacing, components) | Before any UI work |
| **FRONTEND_DEVELOPMENT_RULES.md** | Development rules, patterns, best practices | Before implementing UI |
| **src/app/globals.css** | CSS variables & tokens (510 lines) | When using colors/shadows/radius |
| **src/shared/components/** | 44 reusable components | Before creating new components |

### Design System Overview

**Color System:**
- Brand: rand-50 to rand-900 (#E56A4A coral/terracotta primary)
- Surfaces: g, g-alt, surface, surface-2, surface-3
- Text: 	ext-main, 	ext-muted, 	ext-subtle
- Status: green-500/600 (success), ed-500/600 (error), yellow-500/600 (warning), lue-500/600 (info)

**Typography:**
- Font: Inter with system fallback
- Scale: 	ext-xs (12px), 	ext-sm (14px), 	ext-base (16px), 	ext-lg (18px), 	ext-2xl (24px)
- Weights: ont-medium (500), ont-semibold (600)

**Spacing:**
- Standard: p-3 (12px), p-4 (16px), p-6 (24px), p-8 (32px)
- Gap: gap-2 (8px), gap-3 (12px), gap-4 (16px)
- Responsive: p-4 sm:p-6 lg:p-10

**Components Available:**
- Core: Button, Input, Select, Toggle, Badge
- Layout: Card, Modal, Drawer
- Feedback: Loading, Tooltip, Avatar
- Navigation: SegmentedControl, Pagination
- Shell: Header, Sidebar, Footer, DashboardLayout

### Golden Rules (MANDATORY)

1. **ALWAYS use existing components** - Check src/shared/components/ before creating new ones
2. **ALWAYS use design tokens** - No hardcoded colors/spacing (e.g., use g-brand-500 not g-[#E56A4A])
3. **ALWAYS test light & dark mode** - Every UI change must work in both modes
4. **ALWAYS mobile-first responsive** - Start mobile, scale up (	ext-sm sm:text-base lg:text-lg)
5. **ALWAYS accessibility-first** - Keyboard nav, focus rings, labels, alt text

### Quick Patterns

**Button Usage:**
\\\jsx
import { Button } from '@/shared/components';

<Button variant="primary" size="md" icon="add">Add Provider</Button>
<Button variant="danger" loading={isDeleting}>Delete</Button>
\\\

**Form Layout:**
\\\jsx
<form className="space-y-4">
  <Input label="Name" required error={errors.name} />
  <Select label="Type" options={types} />
  <div className="flex gap-2 justify-end pt-4">
    <Button variant="outline">Cancel</Button>
    <Button variant="primary">Save</Button>
  </div>
</form>
\\\

**Card with Status:**
\\\jsx
<Card title="Provider" subtitle="Status" icon="cloud" hover>
  <Badge variant="success" dot>Connected</Badge>
</Card>
\\\

**Responsive Grid:**
\\\jsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
\\\

### What's FORBIDDEN

- ❌ Hardcoded colors: g-[#E56A4A] or style={{ color: '#000' }}
- ❌ Hardcoded spacing: p-[25px] or arbitrary values
- ❌ Creating new components without checking existing ones
- ❌ Skipping dark mode testing
- ❌ Using <div onClick> instead of <button>
- ❌ Inputs without labels (accessibility violation)
- ❌ Removing focus rings (outline-none)

### Before Submitting Frontend PR

**Checklist:**
- [ ] Uses existing components from src/shared/components/
- [ ] All colors from design tokens (no hardcoded)
- [ ] All spacing from Tailwind scale (no arbitrary)
- [ ] Tested on mobile (375px), tablet (768px), desktop (1440px)
- [ ] Tested light mode
- [ ] Tested dark mode
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] All interactive elements have focus rings
- [ ] All images have alt text
- [ ] All form inputs have labels

**For detailed rules, read:** FRONTEND_DEVELOPMENT_RULES.md

### Where to Look

| Task | Location | Reference |
|------|----------|-----------|
| Find component to use | src/shared/components/index.js | Lists all 44 components |
| Check color tokens | src/app/globals.css lines 1-135 | All CSS variables |
| See component examples | DESIGN_SYSTEM.md lines 289-700 | Usage patterns with code |
| Understand rules | FRONTEND_DEVELOPMENT_RULES.md | Complete development guide |
| Theme logic | src/store/themeStore.js + src/shared/hooks/useTheme.js | Dark mode implementation |

