# open-sse

Provider-agnostic SSE engine: one OpenAI-style request -> any provider (LLM chat, image, embedding, tts, stt, search, fetch), streamed back in the client's format. 96 providers registered.

## Request lifecycle (chat)

`handlers/chatCore.js` -> `services/model.js` `parseModel` (resolve `provider/model`) -> **pre-translate hooks** (`rtk/` tool_result compress, `rtk/headroom.js` proxy compress, `rtk/caveman.js`/`ponytail.js` system inject - all fail-open) -> `executors/index.js` `getExecutor(provider)` -> `translator/index.js` `translateRequest` (client format -> provider format) -> `executor.execute()` (streams upstream) -> `translateResponse` (provider chunks -> client format) -> SSE out.

## Directory map

- `config/` - ALL constants/config (14 files). `providers.js`/`providers/registry/` (96 provider defs), `providerModels.js` (alias->models matrix), `runtimeConfig.js` (timeouts, token limits), `mediaConfig.js`, `codexInstructions.js`, `*Constants.js`.
- `translator/` - format conversion (47 files, 5 subdirs). See `translator/AGENTS.md`.
- `executors/` - per-provider upstream call (24 files). `base.js` (BaseExecutor), one file per special provider, `index.js` map. `default.js` handles OpenAI-compatible APIs.
- `providers/` - registry build + `capabilities.js` + `pricing.js` + `schema.js` + `shared.js`. `registry/` has 96 provider definition files. Entry: `index.js` (PROVIDERS). `REGISTRY_TEMPLATE.js` is the copy template.
- `handlers/` - per-modality cores (6 dirs): `chatCore/` (streaming/non-streaming/sse-to-json), `imageProviders/` (14 image gen providers), `embeddingProviders/`, `ttsProviders/`, `search/` (callers + normalizers), `fetch/`.
- `rtk/` - request token-killer (11 files). `index.js` compresses `tool_result` content in-place; `filters/` (11 per-tool compressors: git diff, grep, ls, tree, etc.) + `autodetect.js`; `headroom.js` external compress proxy; `caveman.js`/`ponytail.js` system-prompt injectors with their prompt files.
- `transformer/` - `responsesTransformer.js` (Chat Completions SSE -> Codex Responses API SSE), `streamToJsonConverter.js`.
- `shared/` - cross-provider auth/identity: `clineAuth.js`, `machineId.js`, `qoder/`.
- `services/` - `model.js`, `provider.js`, `accountFallback.js`, `combo.js`, `compact.js`, `tokenRefresh/`+`tokenRefresh.js`, `oauthCredentialManager.js`, `usage/`, `projectId.js`, `kiroModels.js`/`qoderModels.js`.
- `utils/` - streamHandler, stream, sse, error, sessionManager, claudeCloaking, clientDetector, proxyFetch (patches global fetch), cursorProtobuf/cursorChecksum, ollamaTransform.

## Conventions

- Config-driven, DRY, camelCase. NEVER hardcode values, models, or block/role strings - use `config/` + `schema/` constants.
- Translator pipeline pivots through OpenAI as the intermediate format. A translator registered on the exact `source:target` pair (e.g. `claude:kiro`) runs as a **direct route**, skipping the lossy double-hop.
- Translators self-register via `register(from, to, reqFn, resFn)` as an import side-effect - new files MUST be imported in `translator/index.js`.

## How to add

- **Provider**: copy `providers/REGISTRY_TEMPLATE.js` -> `providers/registry/{id}.js`; add models to `config/providerModels.js`; regenerate `registry/index.js`. Generic providers need no executor (DefaultExecutor handles OpenAI-compatible APIs).
- **Executor** (only for non-standard upstream): subclass `BaseExecutor` (override `getBaseUrls`/`buildHeaders`/`buildUrl`/`execute`), register in `executors/index.js` map. `getExecutor` falls back to `DefaultExecutor` when absent.
- **Translator**: add `request|response/<from>-to-<to>.js` calling `register(...)`, then import it in `translator/index.js`. Reuse `schema/` + `concerns/` - don't re-implement parsing.
- **Image provider**: subclass `imageProviders/_base.js`, add to `imageProviders/index.js`.
- **RTK filter**: add `rtk/filters/{tool}.js`, register in `rtk/registry.js`. Must be fail-open.

## Pitfalls

- OpenAI bridge is lossy (thinking, non-base64 images, tool ids, is_error) - prefer a direct route for fragile pairs.
- `registry/index.js` is an auto-generated static import list; regenerate it (don't hand-edit) after adding a `registry/{id}.js`. REGISTRY_TEMPLATE is excluded by design.
- Special binary/protobuf formats (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI - handle in their executor.
- `rtk/` + `headroom.js` mutate the request body in-place and are **fail-open**: any error returns null and leaves the body untouched - never throw out of them. RTK skips `is_error`/`status:"error"` tool results to preserve traces.
