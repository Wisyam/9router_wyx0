import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToFilter(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    pattern: row.pattern,
    replacement: row.replacement,
    isActive: row.isActive === 1 || row.isActive === true,
    priority: row.priority ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// In-memory cache so the executor doesn't hit SQLite on every chat request.
// Invalidated on any write; TTL is a safety net in case a write happens on
// another process (e.g. dashboard in a different Next.js worker).
const cache = new Map();
const CACHE_TTL_MS = 5000;

function invalidateCache(provider) {
  if (provider) cache.delete(provider);
  else cache.clear();
}

export async function getPromptFilters() {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT * FROM promptFilters ORDER BY priority ASC, createdAt ASC`
  );
  return rows.map(rowToFilter);
}

export async function getPromptFilterById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM promptFilters WHERE id = ?`, [id]);
  return rowToFilter(row);
}

export async function getActiveFiltersByProvider(provider) {
  if (!provider) return [];
  const now = Date.now();
  const cached = cache.get(provider);
  if (cached && cached.expiresAt > now) return cached.filters;

  const db = await getAdapter();
  const rows = db.all(
    `SELECT * FROM promptFilters WHERE provider = ? AND isActive = 1 ORDER BY priority ASC, createdAt ASC`,
    [provider]
  );
  const filters = rows.map(rowToFilter);
  cache.set(provider, { filters, expiresAt: now + CACHE_TTL_MS });
  return filters;
}

const refreshInFlight = new Set();

// Sync accessor for the executor pipeline (transformRequest is not async).
// Returns cached filters immediately; triggers a background refresh on
// cache miss/stale so the next request picks them up.
export function getCachedActiveFilters(provider) {
  if (!provider) return [];
  const now = Date.now();
  const cached = cache.get(provider);
  if (cached && cached.expiresAt > now) return cached.filters;
  if (!refreshInFlight.has(provider)) {
    refreshInFlight.add(provider);
    getActiveFiltersByProvider(provider)
      .catch(() => {})
      .finally(() => refreshInFlight.delete(provider));
  }
  return cached?.filters || [];
}

export async function createPromptFilter(data) {
  if (!data.pattern || !data.replacement || !data.provider) {
    throw new Error("pattern, replacement, and provider are required");
  }
  const db = await getAdapter();
  const filter = {
    id: uuidv4(),
    name: data.name || null,
    provider: data.provider,
    pattern: data.pattern,
    replacement: data.replacement,
    isActive: data.isActive !== false,
    priority: data.priority ?? 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO promptFilters(id, name, provider, pattern, replacement, isActive, priority, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      filter.id,
      filter.name,
      filter.provider,
      filter.pattern,
      filter.replacement,
      filter.isActive ? 1 : 0,
      filter.priority,
      filter.createdAt,
      filter.updatedAt,
    ]
  );
  invalidateCache(filter.provider);
  return filter;
}

export async function updatePromptFilter(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM promptFilters WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToFilter(row), ...data };
    db.run(
      `UPDATE promptFilters SET name = ?, pattern = ?, replacement = ?, isActive = ?, priority = ?, updatedAt = ? WHERE id = ?`,
      [
        merged.name,
        merged.pattern,
        merged.replacement,
        merged.isActive ? 1 : 0,
        merged.priority,
        new Date().toISOString(),
        id,
      ]
    );
    result = merged;
  });
  if (result) invalidateCache(result.provider);
  return result;
}

export async function deletePromptFilter(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT provider FROM promptFilters WHERE id = ?`, [id]);
  const res = db.run(`DELETE FROM promptFilters WHERE id = ?`, [id]);
  if (row) invalidateCache(row.provider);
  return (res?.changes ?? 0) > 0;
}

// Test-only: clear cache between unit tests.
export function __clearCache() {
  cache.clear();
}
