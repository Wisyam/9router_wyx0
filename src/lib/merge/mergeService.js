import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { findDbFile, validateDataDir } from "./findTargetDb.js";
import { getProviderConnections } from "../db/index.js";
import { DATA_DIR } from "../dataDir.js";

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

async function openTargetDb(dbPath) {
  let Database;
  try {
    const mod = await import("better-sqlite3");
    Database = mod.default || mod;
  } catch {
    throw new Error("better-sqlite3 is required for merge. Install it: npm install better-sqlite3");
  }
  const db = new Database(dbPath, { readonly: false });
  db.pragma("busy_timeout = 5000");
  return db;
}

async function readConnectionsFromDb(dbPath) {
  const db = await openTargetDb(dbPath);
  try {
    const rows = db.prepare("SELECT * FROM providerConnections").all();
    return rows.map((row) => {
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
    });
  } finally {
    db.close();
  }
}

function backupTargetDb(dbPath) {
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(backupDir, `pre-merge-${timestamp}.sqlite`);
  fs.copyFileSync(dbPath, backupPath);
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

export async function executeMerge({ targetDataDir, strategy, dryRun, providerFilter }) {
  const validation = validateDataDir(targetDataDir);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const targetDbPath = validation.dbFile;
  const sourceConns = await exportLocalConnections(providerFilter);
  const targetConns = await readConnectionsFromDb(targetDbPath);
  const { toAdd, toSkip } = diffConnections(sourceConns, targetConns);

  const report = {
    timestamp: new Date().toISOString(),
    targetDataDir: validation.dataDir,
    targetDbFile: targetDbPath,
    strategy: strategy || "skip",
    dryRun: !!dryRun,
    summary: {
      totalSource: sourceConns.length,
      totalTarget: targetConns.length,
      toAdd: toAdd.length,
      toSkip: toSkip.length,
    },
    details: [
      ...toAdd.map((c) => ({
        provider: c.provider,
        email: c.email || null,
        name: c.name || null,
        authType: c.authType,
        action: "add",
        newId: c._newId !== c.id ? c._newId : null,
        reason: c._reason,
      })),
      ...toSkip,
    ],
    backupPath: null,
    errors: [],
  };

  if (dryRun || toAdd.length === 0) {
    return report;
  }

  report.backupPath = backupTargetDb(targetDbPath);

  const db = await openTargetDb(targetDbPath);
  try {
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
  } catch (err) {
    report.errors.push(err.message);
  } finally {
    db.close();
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
