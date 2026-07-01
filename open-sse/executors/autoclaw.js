import crypto from "node:crypto";
import { DefaultExecutor } from "./default.js";
import { PROVIDERS } from "../config/providers.js";

const APP_ID = "100003";
const APP_KEY = "38d2391985e2369a5fb8227d8e6cd5e5";

function signHeaders(extra = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sign = crypto.createHash("md5").update(`${APP_ID}&${ts}&${APP_KEY}`).digest("hex");
  return {
    accept: "*/*",
    "content-type": "application/json",
    origin: "https://autoclaw.z.ai",
    referer: "https://autoclaw.z.ai/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "x-auth-appid": APP_ID,
    "x-auth-timestamp": ts,
    "x-auth-sign": sign,
    "x-product": "autoclaw",
    "x-version": "1.10.0",
    "x-tm": "web",
    "x-channel": "official",
    "x-client-type": "web",
    "x-trace-id": crypto.randomUUID(),
    "x-lang": "zh-CN",
    ...extra,
  };
}

function resolveUpstreamModel(model) {
  const providerConfig = PROVIDERS.autoclaw;
  const match = (providerConfig?.models || []).find((m) => m.id === model || m.alias === model);
  return match?.upstreamModelId || model;
}

export class AutoclawExecutor extends DefaultExecutor {
  constructor() {
    super("autoclaw", PROVIDERS.autoclaw || { baseUrl: "", headers: {} });
    this._currentModel = null;
  }

  buildHeaders(credentials, stream) {
    const token = credentials?.accessToken;
    if (!token) {
      throw new Error("autoclaw: missing accessToken");
    }
    const extras = {
      // CRITICAL: LLM proxy uses uppercase 'X-Authorization' (spec quirk).
      "X-Authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      "X-Request-Id": crypto.randomUUID(),
      Accept: stream ? "text/event-stream" : "*/*",
    };
    // CRITICAL: X-Request-Model header selects upstream model; body.model is IGNORED.
    if (this._currentModel) {
      extras["X-Request-Model"] = resolveUpstreamModel(this._currentModel);
    }
    return signHeaders(extras);
  }

  transformRequest(model, body, _stream, _credentials) {
    const upstream = resolveUpstreamModel(model);
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const clean = {
      model: upstream,
      messages,
      stream: true,
      temperature: typeof body?.temperature === "number" ? body.temperature : 0.7,
    };
    if (Array.isArray(body?.tools) && body.tools.length) {
      clean.tools = body.tools;
      if (body.tool_choice) clean.tool_choice = body.tool_choice;
    }
    if (Number.isFinite(body?.max_tokens)) clean.max_tokens = body.max_tokens;
    return clean;
  }

  async execute(args) {
    this._currentModel = args.model;
    try {
      return await super.execute(args);
    } finally {
      this._currentModel = null;
    }
  }

  async refreshCredentials(credentials, log, proxyOptions = null) {
    const { refreshAutoclawToken } = await import("../services/tokenRefresh/autoclaw.js");
    return refreshAutoclawToken(credentials, log, proxyOptions, async (newTokens) => {
      const { updateProviderConnection } = await import("../../src/lib/db/index.js");
      await updateProviderConnection(credentials.connectionId, {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt,
        lastRefreshAt: new Date().toISOString(),
      });
    });
  }

  needsRefresh(credentials) {
    if (!credentials?.expiresAt) return true;
    const expiresAtMs = Date.parse(credentials.expiresAt);
    if (!Number.isFinite(expiresAtMs)) return true;
    return expiresAtMs - Date.now() < 60 * 60 * 1000;
  }
}

export default AutoclawExecutor;
