# src/shared/ - Shared UI Layer

Reusable React components, constants, hooks, and utilities shared across all dashboard pages. 86 JS files.

## STRUCTURE

```
src/shared/
+-- components/         # React components + layouts/ (3 dashboard shell wrappers)
+-- constants/          # Config files (providers, cliTools, routes)
+-- hooks/              # Custom React hooks
+-- services/           # Shared service modules
+-- utils/              # Utility modules
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add shared component | `components/` - flat structure, one file per component |
| Provider metadata | `constants/providers.js` - risk notices, deprecated flags |
| CLI tool definitions | `constants/cliTools.js` - tool configs with requirements |
| Layout wrappers | `components/layouts/` - dashboard shell components |
| Shared hooks | `hooks/` - reusable React hooks |

## CONVENTIONS

- **Flat component directory** - no nested folders except `layouts/`
- **Provider constants carry risk notices** - deprecated/restricted providers flagged inline
- **Zustand stores live in `src/store/`** not here - shared/ is pure React + constants
- **No TypeScript** - plain JS with JSX, Tailwind v4 for styling
- **Material Symbols** for icons (not Lucide/Heroicons)

## KEY CONSTANTS

- `providers.js` - provider metadata, risk levels, deprecated flags (Qwen discontinued 2026-04-15)
- `cliTools.js` - CLI tool definitions with account requirements (e.g. "Requires Cursor Pro")
- Provider icons in `public/providers/` (96 SVG/PNG files)
