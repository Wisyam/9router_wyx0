# tests/ - Test Suite

Vitest-based test suite with unique conventions: data-driven matrix testing, `it.fails()` bug tracking, and tiered test categories. 141 JS files.

## STRUCTURE

```
tests/
+-- vitest.config.js        # REQUIRED: --config flag (alias resolution)
+-- unit/                   # Offline unit tests
+-- translator/             # Translation layer tests (see translator/AGENTS.md)
|   +-- matrix.js           # Dynamic test matrix from PROVIDER_MODELS
|   +-- registerAll.js      # MUST import in every translator test
|   +-- real/               # Live provider tests (RUN_REAL=1)
|   +-- __snapshots__/      # Vitest snapshots
|   +-- *.test.js           # Format roundtrip, bug exposure
+-- __baseline__/           # Baseline test fixtures
+-- package.json            # Isolated deps (vitest installed separately)
```

## RUNNING

```bash
# Standard (offline, no creds needed)
cd tests && npx vitest run --config ./vitest.config.js

# Specific test
npx vitest run --config ./vitest.config.js "tests/unit/kiro.test.js"

# Live provider tests (needs active connections in ~/.9router/db/data.sqlite)
RUN_REAL=1 npx vitest run --config ./vitest.config.js "tests/translator/real/"

# E2E (needs running server)
RUN_E2E=1 RTK_E2E_PORT=20128 npx vitest run --config ./vitest.config.js
```

## CONVENTIONS

- **ALWAYS pass `--config tests/vitest.config.js`** - without it, `@/` and `open-sse` aliases fail
- **ALWAYS import `./registerAll.js`** in translator tests - ESM/Vitest silently skips `require()` registry
- **`it.fails()`** - wraps confirmed unfixed bugs; turns red when fixed -> promote to `it()`
- **Matrix auto-coverage** - new providers in `PROVIDER_MODELS` get tested automatically
- **`maxConcurrency: 60`** - tests run highly parallel
- **401/402/403/429 = skip** in real tests (credential issue, not test failure)

## TEST CATEGORIES

| Suffix | Gate | Network | Purpose |
|--------|------|---------|---------|
| `*.test.js` | none | no | Unit/integration, mocked |
| `*.real.test.js` | `RUN_REAL=1` | yes | Live provider smoke |
| `*.e2e.test.js` | `RUN_E2E=1` | yes | Full server integration |
| `*.installOnly.test.js` | none | maybe | Browser engine setup |

## ANTI-PATTERNS

- Never run tests without `--config` flag (false passes from unresolved aliases)
- Never skip `registerAll.js` import (translator tests silently pass with empty registry)
- Never treat 401/429 as test failures in real tests (credential/quota issue)
- Never hardcode model lists in tests - use matrix.js dynamic generation
