import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

const SUPPORTED_ENGINES = new Set(["chromium", "camoufox"]);
export const DEFAULT_BULK_IMPORT_ENGINE = "chromium";

export function normalizeBulkImportEngine(value) {
  if (typeof value !== "string") return DEFAULT_BULK_IMPORT_ENGINE;
  const lower = value.trim().toLowerCase();
  return SUPPORTED_ENGINES.has(lower) ? lower : DEFAULT_BULK_IMPORT_ENGINE;
}

function loadRuntimeHelper(name) {
  try {
    return requireFromHere(`../../../../cli/hooks/${name}`);
  } catch {
    return null;
  }
}

async function launchChromium({ proxyUrl } = {}) {
  let chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch (firstErr) {
    const runtime = loadRuntimeHelper("playwrightRuntime");
    if (!runtime?.installPlaywrightOnly) {
      const err = new Error(
        `Playwright not installed and runtime helper unavailable. Run "npm install -g playwright && npx playwright install chromium" then retry. Cause: ${firstErr.message}`
      );
      err.code = "PLAYWRIGHT_PACKAGE_MISSING";
      throw err;
    }
    const installed = runtime.installPlaywrightOnly({ silent: false });
    if (!installed.ok) {
      const err = new Error(
        `Playwright auto-install failed: ${installed.reason}. Run "npm install -g playwright && npx playwright install chromium" manually then retry.`
      );
      err.code = "PLAYWRIGHT_INSTALL_FAILED";
      throw err;
    }
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  }
  const options = { headless: true };
  if (proxyUrl) options.proxy = { server: proxyUrl };
  return chromium.launch(options);
}

async function launchCamoufox({ proxyUrl } = {}) {
  let camoufox;
  try {
    camoufox = await import("camoufox-js");
  } catch (firstErr) {
    const runtime = loadRuntimeHelper("camoufoxRuntime");
    if (!runtime?.installCamoufoxOnly) {
      const err = new Error(
        `Camoufox not installed and runtime helper unavailable. Reinstall wyxrouter or pick the Chromium engine. Cause: ${firstErr.message}`
      );
      err.code = "CAMOUFOX_PACKAGE_MISSING";
      throw err;
    }
    const installed = runtime.installCamoufoxOnly({ silent: false });
    if (!installed.ok) {
      const err = new Error(
        `Camoufox auto-install failed: ${installed.reason}. Run "npm install -g camoufox-js && npx camoufox-js fetch" manually then retry. You can also switch back to the Chromium engine.`
      );
      err.code = "CAMOUFOX_INSTALL_FAILED";
      throw err;
    }
    camoufox = await import("camoufox-js");
  }

  if (!camoufox?.launchOptions) {
    const err = new Error(
      `camoufox-js loaded but does not expose launchOptions(); reinstall the package or pick the Chromium engine.`
    );
    err.code = "CAMOUFOX_API_MISMATCH";
    throw err;
  }

  let firefox;
  try {
    const pwCore = await import("playwright-core");
    firefox = pwCore.firefox;
  } catch {
    try {
      const pw = await import("playwright");
      firefox = pw.firefox;
    } catch (err) {
      const friendly = new Error(
        `Playwright is required to drive Camoufox. Run "npm install -g playwright" or pick the Chromium engine.`
      );
      friendly.code = "PLAYWRIGHT_PACKAGE_MISSING";
      friendly.cause = err;
      throw friendly;
    }
  }

  const camoufoxOptions = await camoufox.launchOptions({ headless: true });
  const launchOptions = { ...camoufoxOptions };
  if (proxyUrl) launchOptions.proxy = { server: proxyUrl };

  return firefox.launch(launchOptions);
}

export async function launchBulkImportBrowser({ engine = DEFAULT_BULK_IMPORT_ENGINE, proxyUrl } = {}) {
  const normalized = normalizeBulkImportEngine(engine);
  if (normalized === "camoufox") {
    return launchCamoufox({ proxyUrl });
  }
  return launchChromium({ proxyUrl });
}

export function makeBrowserLauncher({ engine, proxyUrl } = {}) {
  return () => launchBulkImportBrowser({ engine, proxyUrl });
}
