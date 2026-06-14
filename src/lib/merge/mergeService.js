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

/**
 * Heuristic plan/health inference from connection row data.
 * No network calls — purely reads existing fields written by runtime
 * (testStatus, lastError, errorCode, modelLock_*, lastUsedAt).
 *
 * Returns:
 *   { tier: "pro"|"trial"|"unknown"|"failed", source: "stored"|"heuristic", note: string }
 *
 * Currently specialised for "qoder" (since that is the provider where plan
 * tier matters most). Other providers fall back to passive testStatus.
 */
export function inferPlanHeuristic(conn) {
  if (!conn) return { tier: "unknown", source: "heuristic", note: "" };

  // 1) If a stored planTier exists (e.g. populated by qoderBulkImportManager
  //    on login), trust it. Normalise common synonyms.
  const storedTier = (conn.providerSpecificData?.planTier || "").toLowerCase().trim();
  if (storedTier) {
    if (storedTier === "pro" || storedTier === "premium" || storedTier === "paid") {
      return { tier: "pro", source: "stored", note: storedTier };
    }
    if (storedTier === "basic" || storedTier === "trial" || storedTier === "free") {
      return { tier: "trial", source: "stored", note: storedTier };
    }
    return { tier: "unknown", source: "stored", note: storedTier };
  }

  // 2) Heuristic for provider=qoder based on runtime signals
  if (conn.provider === "qoder") {
    const status = (conn.testStatus || "").toLowerCase();
    const errCode = conn.errorCode;
    const errText = (conn.lastError || "").toLowerCase();

    // Plan/paywall markers in the last error
    const planErrorPattern = /(plan|subscription|upgrade|premium|pro\s*tier|trial\s*expired|payment|paywall|insufficient.*quota|free.*plan)/i;
    if (planErrorPattern.test(errText) || errCode === 402 || errCode === 403) {
      return { tier: "trial", source: "heuristic", note: "plan-error" };
    }

    // modelLock signal: locked premium models but qwen still free
    const lockKeys = Object.keys(conn).filter((k) => k.startsWith("modelLock_"));
    const now = Date.now();
    const activeLocks = lockKeys
      .map((k) => ({ k, until: conn[k] }))
      .filter((l) => l.until && new Date(l.until).getTime() > now);
    const premiumLocked = activeLocks.some((l) => /claude|gpt|o1|o3|sonnet|opus|haiku/i.test(l.k));
    const qwenLocked = activeLocks.some((l) => /qwen/i.test(l.k));
    if (premiumLocked && !qwenLocked) {
      return { tier: "trial", source: "heuristic", note: "premium-locked" };
    }

    if (status === "unavailable" || status === "rate_limited") {
      return { tier: "failed", source: "heuristic", note: status };
    }

    if (status === "active" && (conn.consecutiveUseCount || 0) > 0) {
      // Has been used successfully at least once with no plan-related lock
      return { tier: "pro", source: "heuristic", note: "used-ok" };
    }

    // Active but never used — too early to tell
    if (status === "active") {
      return { tier: "unknown", source: "heuristic", note: "untested" };
    }

    return { tier: "unknown", source: "heuristic", note: status || "no-signal" };
  }

  // Generic fallback for non-qoder providers
  const status = (conn.testStatus || "").toLowerCase();
  if (status === "unavailable") return { tier: "failed", source: "heuristic", note: status };
  if (status === "active") return { tier: "pro", source: "heuristic", note: status };
  return { tier: "unknown", source: "heuristic", note: status || "no-signal" };
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
      ...toAdd.map((c) => {
        const plan = inferPlanHeuristic(c);
        return {
          provider: c.provider,
          email: c.email || null,
          name: c.name || null,
          authType: c.authType,
          action: "add",
          newId: c._newId !== c.id ? c._newId : null,
          reason: c._reason,
          fingerprint: fingerprint(c),
          // Heuristic snapshot — UI can override via probe-plans endpoint
          planTier: plan.tier,
          planSource: plan.source,
          planNote: plan.note,
          testStatus: c.testStatus || null,
        };
      }),
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

/**
 * Read a list of qoder connections (with their accessToken) from the merge
 * source side. Used by the live plan-probe endpoint so we never need to leak
 * tokens through the preview response.
 *
 * @param {Object} opts
 * @param {"push"|"pull"} opts.direction
 * @param {string} opts.externalDataDir
 * @param {string[]} [opts.fingerprints] - if provided, only return rows whose fingerprint matches
 */
export async function readQoderTokensForProbe({ direction, externalDataDir, fingerprints }) {
  const dir = direction === "pull" ? "pull" : "push";
  let conns;
  if (dir === "pull") {
    const validation = validateDataDir(externalDataDir);
    if (!validation.valid) throw new Error(validation.reason);
    conns = await readConnectionsFromExternalDb(validation.dbFile);
  } else {
    conns = await getProviderConnections();
  }

  let qoderConns = conns.filter((c) => c.provider === "qoder");
  if (Array.isArray(fingerprints) && fingerprints.length > 0) {
    const want = new Set(fingerprints);
    qoderConns = qoderConns.filter((c) => want.has(fingerprint(c)));
  }
  return qoderConns.map((c) => ({
    fingerprint: fingerprint(c),
    id: c.id,
    email: c.email || null,
    accessToken: c.accessToken || null,
    expiresAt: c.expiresAt || null,
    storedPlanTier: c.providerSpecificData?.planTier || "",
  }));
}

/**
 * Persist a probed planTier back into the source DB so future opens are
 * instant. No-op if writing fails (best effort, side effect only).
 *
 * @param {Object} opts
 * @param {"push"|"pull"} opts.direction
 * @param {string} opts.externalDataDir
 * @param {Array<{id: string, planTier: string, planStatus?: string}>} opts.updates
 */
export async function persistProbedPlanTiers({ direction, externalDataDir, updates }) {
  if (!Array.isArray(updates) || updates.length === 0) return { written: 0 };
  const dir = direction === "pull" ? "pull" : "push";
  const probedAt = new Date().toISOString();

  if (dir === "pull") {
    // Source = external DB → write directly via better-sqlite3
    const validation = validateDataDir(externalDataDir);
    if (!validation.valid) throw new Error(validation.reason);
    const db = await openExternalDb(validation.dbFile);
    let written = 0;
    try {
      const select = db.prepare("SELECT data FROM providerConnections WHERE id = ?");
      const update = db.prepare("UPDATE providerConnections SET data = ?, updatedAt = ? WHERE id = ?");
      const tx = db.transaction(() => {
        for (const u of updates) {
          const row = select.get(u.id);
          if (!row) continue;
          const data = parseJson(row.data, {});
          const psd = data.providerSpecificData || {};
          psd.planTier = u.planTier || "";
          if (u.planStatus) psd.planStatus = u.planStatus;
          psd.planTierProbedAt = probedAt;
          data.providerSpecificData = psd;
          update.run(stringifyJson(data), new Date().toISOString(), u.id);
          written++;
        }
      });
      tx();
      try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
    } finally {
      db.close();
    }
    return { written };
  }

  // Source = local DB → use active adapter
  const adapter = await getAdapter();
  let written = 0;
  adapter.transaction(() => {
    for (const u of updates) {
      const row = adapter.get("SELECT data FROM providerConnections WHERE id = ?", [u.id]);
      if (!row) continue;
      const data = parseJson(row.data, {});
      const psd = data.providerSpecificData || {};
      psd.planTier = u.planTier || "";
      if (u.planStatus) psd.planStatus = u.planStatus;
      psd.planTierProbedAt = probedAt;
      data.providerSpecificData = psd;
      adapter.run(
        "UPDATE providerConnections SET data = ?, updatedAt = ? WHERE id = ?",
        [stringifyJson(data), new Date().toISOString(), u.id],
      );
      written++;
    }
  });
  return { written };
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
