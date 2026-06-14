import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChromiumLaunch = vi.fn();
const mockFirefoxLaunch = vi.fn();
const mockInstallPlaywrightOnly = vi.fn();
const mockInstallCamoufoxOnly = vi.fn();

vi.mock("playwright", () => ({
  chromium: { launch: mockChromiumLaunch },
  firefox: { launch: mockFirefoxLaunch },
}));

vi.mock("playwright-core", () => ({
  firefox: { launch: mockFirefoxLaunch },
}));

vi.mock("../../../../cli/hooks/playwrightRuntime", () => ({
  installPlaywrightOnly: mockInstallPlaywrightOnly,
  ensurePlaywrightRuntime: vi.fn(() => ({ ok: true })),
}));

vi.mock("../../../../cli/hooks/camoufoxRuntime", () => ({
  installCamoufoxOnly: mockInstallCamoufoxOnly,
  ensureCamoufoxRuntime: vi.fn(() => ({ ok: true })),
}));

import {
  launchBulkImportBrowser,
  normalizeBulkImportEngine,
  DEFAULT_BULK_IMPORT_ENGINE,
} from "../../src/lib/oauth/services/bulkImportBrowserEngine.js";

describe("normalizeBulkImportEngine", () => {
  it("returns chromium for unknown values", () => {
    expect(normalizeBulkImportEngine("unknown")).toBe("chromium");
    expect(normalizeBulkImportEngine(null)).toBe("chromium");
    expect(normalizeBulkImportEngine(undefined)).toBe("chromium");
  });

  it("returns chromium for 'chromium'", () => {
    expect(normalizeBulkImportEngine("chromium")).toBe("chromium");
    expect(normalizeBulkImportEngine("CHROMIUM")).toBe("chromium");
  });

  it("returns camoufox for 'camoufox'", () => {
    expect(normalizeBulkImportEngine("camoufox")).toBe("camoufox");
    expect(normalizeBulkImportEngine("CAMOUFOX")).toBe("camoufox");
  });

  it("DEFAULT_BULK_IMPORT_ENGINE is chromium", () => {
    expect(DEFAULT_BULK_IMPORT_ENGINE).toBe("chromium");
  });
});

describe("launchBulkImportBrowser — chromium engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: import playwright succeeds → chromium.launch called with headless:true", async () => {
    const mockBrowser = { close: vi.fn() };
    mockChromiumLaunch.mockResolvedValue(mockBrowser);

    const browser = await launchBulkImportBrowser({ engine: "chromium" });
    expect(browser).toBe(mockBrowser);
    expect(mockChromiumLaunch).toHaveBeenCalledWith({ headless: true });
    expect(mockInstallPlaywrightOnly).not.toHaveBeenCalled();
  });

  it("happy path with proxyUrl: proxy option passed to chromium.launch", async () => {
    const mockBrowser = { close: vi.fn() };
    mockChromiumLaunch.mockResolvedValue(mockBrowser);

    await launchBulkImportBrowser({ engine: "chromium", proxyUrl: "http://proxy:8080" });
    expect(mockChromiumLaunch).toHaveBeenCalledWith({
      headless: true,
      proxy: { server: "http://proxy:8080" },
    });
  });

  it("default engine is chromium", async () => {
    const mockBrowser = { close: vi.fn() };
    mockChromiumLaunch.mockResolvedValue(mockBrowser);

    await launchBulkImportBrowser();
    expect(mockChromiumLaunch).toHaveBeenCalled();
  });

  it("installPlaywrightOnly is NOT called when playwright import succeeds", async () => {
    mockChromiumLaunch.mockResolvedValue({ close: vi.fn() });

    await launchBulkImportBrowser({ engine: "chromium" });
    expect(mockInstallPlaywrightOnly).not.toHaveBeenCalled();
  });
});
