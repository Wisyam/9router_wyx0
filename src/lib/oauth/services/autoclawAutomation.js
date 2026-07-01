import crypto from "node:crypto";
import { runGoogleAccountAutomation } from "./kiroGoogleAutomation.js";

const BASE_URL = "https://autoglm-api.autoglm.ai";
const APP_ID = "100003";
const APP_KEY = "38d2391985e2369a5fb8227d8e6cd5e5";
const REDIRECT_URI = `${BASE_URL}/userapi/oauth/google/callback`;
const DEFAULT_SHORT_TIMEOUT_MS = 90_000;
const DEFAULT_MANUAL_TIMEOUT_MS = 15 * 60_000;

export function signHeaders(extra = {}) {
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

export async function getAutoclawOAuthUrl(deviceId) {
  const res = await fetch(`${BASE_URL}/userapi/overseasv1/google-oauth-url`, {
    method: "POST",
    headers: signHeaders(),
    body: JSON.stringify({
      device_id: deviceId,
      source_id: "web",
      navigate_uri: REDIRECT_URI,
      client_type: "web",
    }),
  });
  if (!res.ok) {
    throw new Error(`autoclaw oauth-url HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 0 && json.code !== undefined) {
    throw new Error(`autoclaw oauth-url code ${json.code}: ${json.message || ""}`);
  }
  const data = json.data || json;
  return { oauthUrl: data.oauth_url, state: data.state };
}

export function createAutoclawCallbackMonitor(context, page, timeoutMs = DEFAULT_MANUAL_TIMEOUT_MS) {
  let resolveOuter;
  let rejectOuter;
  const promise = new Promise((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });

  let settled = false;
  const cleanups = [];
  const timeoutHandle = setTimeout(() => {
    settle(null, new Error("Timed out waiting for AutoClaw OAuth callback"));
  }, timeoutMs);

  function settle(result, error = null) {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutHandle);
    for (const fn of cleanups) {
      try { fn(); } catch {}
    }
    if (error) rejectOuter(error);
    else resolveOuter(result);
  }

  const onResponse = async (response) => {
    try {
      const url = response.url();
      if (!url.includes("/userapi/overseasv1/google-oauth-login") && !url.includes("/userapi/v1/refresh")) {
        return;
      }
      const body = await response.json();
      if (body?.code === 0 && body?.data?.access_token) {
        settle({
          access_token: body.data.access_token,
          refresh_token: body.data.refresh_token || "",
          user_id: body.data.user_id,
          user_name: body.data.user_name,
          first_login: body.data.first_login,
        });
      }
    } catch {
      // response already consumed or not JSON
    }
  };

  page.on("response", onResponse);
  cleanups.push(() => page.off("response", onResponse));

  promise.rebind = ({ context: newContext, page: newPage } = {}) => {
    if (newPage) {
      newPage.on("response", onResponse);
      cleanups.push(() => newPage.off("response", onResponse));
    }
  };

  return promise;
}

export async function runAutoclawGoogleAutomation({
  page,
  email,
  password,
  deviceId,
  callbackPromise,
  shortTimeoutMs = DEFAULT_SHORT_TIMEOUT_MS,
  onStep,
}) {
  const reportStep = (step, message) => onStep?.(step, message);

  reportStep("fetching_oauth_url", "Requesting AutoClaw Google OAuth URL");
  const { oauthUrl } = await getAutoclawOAuthUrl(deviceId);
  if (!oauthUrl) {
    return { status: "failed", error: "Failed to obtain AutoClaw OAuth URL" };
  }

  return runGoogleAccountAutomation({
    page,
    authUrl: oauthUrl,
    email,
    password,
    successPromise: callbackPromise,
    shortTimeoutMs,
    serviceLabel: "AutoClaw",
    openingStep: "opening_google_oauth",
    openingMessage: "Opening Google OAuth page for AutoClaw",
    successStep: "autoclaw_callback_received",
    successMessage: "AutoClaw callback received",
    onStep,
  });
}
