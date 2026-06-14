import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { findDbFile, validateDataDir } from "./findTargetDb.js";
import { getProviderConnections } from "../db/index.js";
import { getAdapter } from "../db/driver.js";
import { DATA_DIR } from "../dataDir.js";
import { DATA_FILE as LOCAL_DB_FILE, BACKUPS_DIR as LOCAL_BACKUPS_DIR } from "../db/paths.js";

const MERGE_HISTORY_DIR = path.join(DATA_DIR, "merge-history");
const MAX_HISTORY = 20;

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function stringifyJson(value) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

function fingerprint(conn) {
  if (conn.authType === "oauth" && conn.email) {
    return `${conn.provider}::${conn.email.toLowerCase()}`;
  }
  if (conn.authType === "apikey" && conn.name) {
    return `${conn.provider}::${conn.name}`;
  }
  return `${conn.provider}::${conn.id}`;
}

async function openExternalDb(dbPath, { readonly = false } = {}) {
  let Database;
  try {
    const mod = await import("better-sqlite3");
    Database = mod.default || mod;
  } catch {
    throw new Error("better-sqlite3 is required for merge. Install it: npm install better-sqlite3");
  }
  const db = new Database(dbPath, { readonly });
  db.pragma("busy_timeout = 5000");
  return db;
}

function rowToConn(row) {
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    provider: row.provider,
    authType: row.authType,
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readConnectionsFromExternalDb(dbPath) {
  const db = await openExternalDb(dbPath, { readonly: true });
  try {
    const rows = db.prepare("SELECT * FROM providerConnections").all();
    return rows.map(rowToConn);
  } finally {
    db.close();
  }
}

function backupDbFile(dbPath, label = "pre-merge") {
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(backupDir, `${label}-${timestamp}.sqlite`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

async function backupLocalDb(label = "pre-merge") {
  // Ensure WAL is checkpointed so the backup is consistent
  try {
    const adapter = await getAdapter();
    if (typeof adapter.pragma === "function") {
      try { adapter.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
    } else if (typeof adapter.exec === "function") {
      try { adapter.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
    }
  } catch {}
  fs.mkdirSync(LOCAL_BACKUPS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(LOCAL_BACKUPS_DIR, `${label}-${timestamp}.sqlite`);
  fs.copyFileSync(LOCAL_DB_FILE, backupPath);
  return backupPath;
}

export async function exportLocalConnections(providerFilter) {
  let connections = await getProviderConnections();
  if (providerFilter && providerFilter.length > 0) {
    const filterSet = new Set(providerFilter.map((p) => p.toLowerCase()));
    connections = connections.filter((c) => filterSet.has(c.provider.toLowerCase()));
  }
  return connections;
}

export function diffConnections(sourceConns, targetConns) {
  const targetFingerprints = new Set(targetConns.map(fingerprint));
  const targetIds = new Set(targetConns.map((c) => c.id));

  const toAdd = [];
  const toSkip = [];

  for (const conn of sourceConns) {
    const fp = fingerprint(conn);
    if (targetFingerprints.has(fp)) {
      toSkip.push({
        id: conn.id,
        provider: conn.provider,
        email: conn.email || null,
        name: conn.name || null,
        authType: conn.authType,
        reason: "duplicate",
        fingerprint: fp,
      });
    } else {
      const needsNewId = targetIds.has(conn.id);
      toAdd.push({
        ...conn,
        _newId: needsNewId ? uuidv4() : conn.id,
        _reason: needsNewId ? "id_collision" : "new",
      });
    }
  }

  return { toAdd, toSkip };
}

function buildReport({ direction, externalDataDir, externalDbFile, strategy, dryRun, sourceConns, targetConns, toAdd, toSkip }) {
  const allProviders = new Set([
    ...sourceConns.map((c) => c.provider),
    ...targetConns.map((c) => c.provider),
  ]);
  const countByProvider = (conns) => {
    const map = {};
    for (const c of conns) map[c.provider] = (map[c.provider] || 0) + 1;
    return map;
  };
  const sourceCount = countByProvider(sourceConns);
  const targetCount = countByProvider(targetConns);
  const addCount = countByProvider(toAdd);
  const skipCount = countByProvider(toSkip);

  const providerBreakdown = [...allProviders]
    .sort((a, b) => (targetCount[b] || 0) - (targetCount[a] || 0))
    .map((provider) => {
      const src = sourceCount[provider] || 0;
      const tgt = targetCount[provider] || 0;
      const add = addCount[provider] || 0;
      const skip = skipCount[provider] || 0;
      return {
        provider,
        source: src,
        target: tgt,
        toAdd: add,
        toSkip: skip,
        afterMerge: tgt + add,
      };
    });

  const localResolved = path.resolve(DATA_DIR);
  const sourceDataDir = direction === "pull" ? externalDataDir : localResolved;
  const targetDataDir = direction === "pull" ? localResolved : externalDataDir;
  const sourceDbFile = direction === "pull" ? externalDbFile : LOCAL_DB_FILE;
  const targetDbFile = direction === "pull" ? LOCAL_DB_FILE : externalDbFile;

  return {
    timestamp: new Date().toISOString(),
    direction,
    sourceDataDir,
    targetDataDir,
    sourceDbFile,
    targetDbFile,
    // Backward-compat aliases (older history readers expect these fields)
    targetDbFile_legacy: targetDbFile,
    strategy: strategy || "skip",
    dryRun: !!dryRun,
    summary: {
      totalSource: sourceConns.length,
      totalTarget: targetConns.length,
      toAdd: toAdd.length,
      toSkip: toSkip.length,
      afterMerge: targetConns.length + toAdd.length,
    },
    providerBreakdown,
    details: [
      ...toAdd.map((c) => ({
        provider: c.provider,
        email: c.email || null,
        name: c.name || null,
        authType: c.authType,
        action: "add",
        newId: c._newId !== c.id ? c._newId : null,
        reason: c._reason,
        fingerprint: fingerprint(c),
      })),
      ...toSkip,
    ],
    backupPath: null,
    errors: [],
  };
}

function insertConnRowsExternal(db, toAdd) {
  const insertStmt = db.prepare(
    `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const writeAll = db.transaction(() => {
    for (const conn of toAdd) {
      const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, _newId, _reason, ...rest } = conn;
      const finalId = _newId || id;
      const now = new Date().toISOString();
      insertStmt.run(
        finalId,
        provider,
        authType || "oauth",
        name || null,
        email || null,
        priority || null,
        isActive === false ? 0 : 1,
        stringifyJson(rest),
        createdAt || now,
        updatedAt || now,
      );
    }
  });
  writeAll();
  try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
}

async function insertConnRowsLocal(toAdd) {
  // Use the active local adapter so we don't conflict with the running dev server's DB lock.
  const adapter = await getAdapter();
  adapter.transaction(() => {
    for (const conn of toAdd) {
      const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, _newId, _reason, ...rest } = conn;
      const finalId = _newId || id;
      const now = new Date().toISOString();
      adapter.run(
        `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalId,
          provider,
          authType || "oauth",
          name || null,
          email || null,
          priority || null,
          isActive === false ? 0 : 1,
          stringifyJson(rest),
          createdAt || now,
          updatedAt || now,
        ],
      );
    }
  });
}

/**
 * Cross-instance merge.
 *
 * @param {Object} opts
 * @param {"push"|"pull"} [opts.direction="push"] - "push" = local → external, "pull" = external → local
 * @param {string} opts.externalDataDir - Other 9router instance's data dir (the "remote" side)
 * @param {string} [opts.targetDataDir] - Backward-compat alias for externalDataDir
 * @param {string} [opts.strategy] - "skip" (default) or "add-as-new"
 * @param {boolean} [opts.dryRun=true]
 * @param {string[]} [opts.providerFilter]
 * @param {string[]} [opts.excludeFingerprints] - Fingerprints (from preview details) to skip during execute
 */
export async function executeMerge(opts) {
  const direction = opts.direction === "pull" ? "pull" : "push";
  const externalDataDir = opts.externalDataDir || opts.targetDataDir;
  const { strategy, dryRun, providerFilter, excludeFingerprints } = opts;

  if (!externalDataDir) {
    throw new Error("externalDataDir (or targetDataDir) is required");
  }

  const validation = validateDataDir(externalDataDir);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  const externalDbPath = validation.dbFile;

  // Read source + target according to direction
  let sourceConns;
  let targetConns;
  if (direction === "pull") {
    sourceConns = await readConnectionsFromExternalDb(externalDbPath);
    if (providerFilter && providerFilter.length > 0) {
      const filterSet = new Set(providerFilter.map((p) => p.toLowerCase()));
      sourceConns = sourceConns.filter((c) => filterSet.has(c.provider.toLowerCase()));
    }
    targetConns = await getProviderConnections();
  } else {
    sourceConns = await exportLocalConnections(providerFilter);
    targetConns = await readConnectionsFromExternalDb(externalDbPath);
  }

  const { toAdd, toSkip } = diffConnections(sourceConns, targetConns);

  // Apply user exclusion (from preview-step checkboxes) — only on real execute.
  // toSkip is unaffected; we move excluded items into toSkip with reason "user_excluded".
  let effectiveToAdd = toAdd;
  let effectiveToSkip = toSkip;
  if (!dryRun && Array.isArray(excludeFingerprints) && excludeFingerprints.length > 0) {
    const excludeSet = new Set(excludeFingerprints);
    const kept = [];
    const userExcluded = [];
    for (const c of toAdd) {
      if (excludeSet.has(fingerprint(c))) {
        userExcluded.push({
          id: c.id,
          provider: c.provider,
          email: c.email || null,
          name: c.name || null,
          authType: c.authType,
          reason: "user_excluded",
          fingerprint: fingerprint(c),
        });
      } else {
        kept.push(c);
      }
    }
    effectiveToAdd = kept;
    effectiveToSkip = [...toSkip, ...userExcluded];
  }

  const report = buildReport({
    direction,
    externalDataDir: validation.dataDir,
    externalDbFile: externalDbPath,
    strategy,
    dryRun,
    sourceConns,
    targetConns,
    toAdd: effectiveToAdd,
    toSkip: effectiveToSkip,
  });

  if (dryRun || effectiveToAdd.length === 0) {
    return report;
  }

  // Real merge: backup the *target* (the side being modified) then INSERT
  if (direction === "pull") {
    try {
      report.backupPath = await backupLocalDb("pre-merge-pull");
    } catch (err) {
      report.errors.push(`Local backup failed: ${err.message}`);
    }
    try {
      await insertConnRowsLocal(effectiveToAdd);
    } catch (err) {
      report.errors.push(err.message);
    }
  } else {
    try {
      report.backupPath = backupDbFile(externalDbPath, "pre-merge");
    } catch (err) {
      report.errors.push(`External backup failed: ${err.message}`);
    }
    const db = await openExternalDb(externalDbPath);
    try {
      insertConnRowsExternal(db, effectiveToAdd);
    } catch (err) {
      report.errors.push(err.message);
    } finally {
      db.close();
    }
  }

  return report;
}

export function saveMergeReport(report) {
  fs.mkdirSync(MERGE_HISTORY_DIR, { recursive: true });
  const filename = `merge-${report.timestamp.replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(MERGE_HISTORY_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");

  try {
    const files = fs.readdirSync(MERGE_HISTORY_DIR)
      .filter((f) => f.startsWith("merge-") && f.endsWith(".json"))
      .map((f) => ({ name: f, full: path.join(MERGE_HISTORY_DIR, f), mtime: fs.statSync(path.join(MERGE_HISTORY_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_HISTORY)) {
      try { fs.unlinkSync(old.full); } catch {}
    }
  } catch {}
}
