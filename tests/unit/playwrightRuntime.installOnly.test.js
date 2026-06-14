import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import childProcess from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireCJS = createRequire(import.meta.url);

function makeSpawnSyncResult(status, stderr = "") {
  return { status, stderr, stdout: "", pid: 1, signal: null, error: null };
}

const sqliteRuntimePath = path.resolve(__dirname, "../../cli/hooks/sqliteRuntime.js");
const playwrightRuntimePath = path.resolve(__dirname, "../../cli/hooks/playwrightRuntime.js");

describe("installPlaywrightOnly", () => {
  let mod;
  let sqliteMod;
  let spawnSyncSpy;
  let existsSyncSpy;

  beforeEach(() => {
    delete requireCJS.cache?.[playwrightRuntimePath];
    delete requireCJS.cache?.[sqliteRuntimePath];

    sqliteMod = requireCJS(sqliteRuntimePath);
    vi.spyOn(sqliteMod, "runNpmInstall");
    vi.spyOn(sqliteMod, "getRuntimeDir").mockReturnValue("/fake/runtime");
    vi.spyOn(sqliteMod, "getRuntimeNodeModules").mockReturnValue("/fake/runtime/node_modules");

    spawnSyncSpy = vi.spyOn(childProcess, "spawnSync");
    existsSyncSpy = vi.spyOn(fs, "existsSync");

    delete requireCJS.cache?.[playwrightRuntimePath];
    mod = requireCJS(playwrightRuntimePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports installPlaywrightOnly as a function", () => {
    expect(typeof mod.installPlaywrightOnly).toBe("function");
  });

  it("happy path: npm install ok + chromium fetch ok → { ok: true }", () => {
    sqliteMod.runNpmInstall.mockReturnValue({ ok: true, code: 0, stderr: "", stdout: "" });
    existsSyncSpy.mockImplementation((p) => String(p).includes("cli.js"));
    spawnSyncSpy.mockReturnValue(makeSpawnSyncResult(0));

    const result = mod.installPlaywrightOnly({ silent: true });
    expect(result).toEqual({ ok: true });
    expect(sqliteMod.runNpmInstall).toHaveBeenCalledOnce();
    expect(spawnSyncSpy).toHaveBeenCalledOnce();
  });

  it("npm install fails with network error → { ok: false, reason includes network/internet/registry }", () => {
    sqliteMod.runNpmInstall.mockReturnValue({
      ok: false,
      code: 1,
      stderr: "npm ERR! code ENOTFOUND\nnpm ERR! getaddrinfo ENOTFOUND registry.npmjs.org",
      stdout: "",
    });

    const result = mod.installPlaywrightOnly({ silent: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason.toLowerCase()).toMatch(/network|internet|registry/);
  });

  it("npm install fails with permission error → { ok: false, reason includes 'permission' }", () => {
    sqliteMod.runNpmInstall.mockReturnValue({
      ok: false,
      code: 1,
      stderr: "npm ERR! code EACCES\nnpm ERR! permission denied",
      stdout: "",
    });

    const result = mod.installPlaywrightOnly({ silent: true });
    expect(result.ok).toBe(false);
    expect(result.reason.toLowerCase()).toMatch(/permission/);
  });

  it("npm install fails with disk space error → { ok: false, reason includes disk/space }", () => {
    sqliteMod.runNpmInstall.mockReturnValue({
      ok: false,
      code: 1,
      stderr: "npm ERR! ENOSPC: no space left on device",
      stdout: "",
    });

    const result = mod.installPlaywrightOnly({ silent: true });
    expect(result.ok).toBe(false);
    expect(result.reason.toLowerCase()).toMatch(/disk|space/);
  });

  it("npm install ok but cli.js not found → { ok: false, reason }", () => {
    sqliteMod.runNpmInstall.mockReturnValue({ ok: true, code: 0, stderr: "", stdout: "" });
    existsSyncSpy.mockReturnValue(false);

    const result = mod.installPlaywrightOnly({ silent: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("npm install ok, cli.js exists, chromium fetch fails → { ok: false, reason }", () => {
    sqliteMod.runNpmInstall.mockReturnValue({ ok: true, code: 0, stderr: "", stdout: "" });
    existsSyncSpy.mockImplementation((p) => String(p).includes("cli.js"));
    spawnSyncSpy.mockReturnValue(makeSpawnSyncResult(1, "ENOTFOUND registry.npmjs.org"));

    const result = mod.installPlaywrightOnly({ silent: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("does NOT throw even when playwright package is not resolvable", () => {
    sqliteMod.runNpmInstall.mockReturnValue({ ok: true, code: 0, stderr: "", stdout: "" });
    existsSyncSpy.mockImplementation((p) => String(p).includes("cli.js"));
    spawnSyncSpy.mockReturnValue(makeSpawnSyncResult(0));

    expect(() => mod.installPlaywrightOnly({ silent: true })).not.toThrow();
  });
});
