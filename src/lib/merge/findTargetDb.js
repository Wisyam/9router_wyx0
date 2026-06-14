import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB_SUBDIR = "db";
const DB_FILENAME = "data.sqlite";
const APP_NAME = "9router";

function defaultDataDirs() {
  if (process.platform === "win32") {
    return [
      path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME),
    ];
  }
  return [path.join(os.homedir(), `.${APP_NAME}`)];
}

export function findDbFile(dataDir) {
  const dbPath = path.join(dataDir, DB_SUBDIR, DB_FILENAME);
  if (fs.existsSync(dbPath)) return dbPath;
  const legacy = path.join(dataDir, DB_FILENAME);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

export function validateDataDir(dir) {
  if (!dir || typeof dir !== "string") {
    return { valid: false, reason: "Directory path is required" };
  }
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) {
    return { valid: false, reason: `Directory not found: ${resolved}` };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return { valid: false, reason: "Path is not a directory" };
  }
  const dbFile = findDbFile(resolved);
  if (!dbFile) {
    return { valid: false, reason: `No 9router database found in ${resolved} (expected ${DB_SUBDIR}/${DB_FILENAME})` };
  }
  return { valid: true, dbFile, dataDir: resolved };
}

export function detectLocalInstances() {
  const candidates = [];
  const seen = new Set();

  function addCandidate(dataDir, label) {
    const resolved = path.resolve(dataDir);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    const check = validateDataDir(resolved);
    if (check.valid) {
      candidates.push({ dataDir: resolved, dbFile: check.dbFile, label });
    }
  }

  for (const dir of defaultDataDirs()) {
    addCandidate(dir, "Default 9router data directory");
  }

  if (process.env.DATA_DIR) {
    addCandidate(process.env.DATA_DIR, "DATA_DIR env variable");
  }

  return candidates;
}
