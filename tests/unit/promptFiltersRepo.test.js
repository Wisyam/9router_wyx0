import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = [];

const mockDb = {
  all(sql, params = []) {
    let result = [...rows];
    if (sql.includes("WHERE provider = ?") && sql.includes("isActive = 1")) {
      result = result.filter((r) => r.provider === params[0] && r.isActive === 1);
    }
    return result.sort(
      (a, b) =>
        (a.priority || 0) - (b.priority || 0) ||
        (a.createdAt || "").localeCompare(b.createdAt || "")
    );
  },
  get(sql, params = []) {
    return rows.find((r) => r.id === params[0]) || null;
  },
  run(sql, params = []) {
    if (sql.startsWith("INSERT")) {
      rows.push({
        id: params[0],
        name: params[1],
        provider: params[2],
        pattern: params[3],
        replacement: params[4],
        isActive: params[5],
        priority: params[6],
        createdAt: params[7],
        updatedAt: params[8],
      });
      return { changes: 1 };
    }
    if (sql.startsWith("UPDATE")) {
      const row = rows.find((r) => r.id === params[6]);
      if (row) {
        row.name = params[0];
        row.pattern = params[1];
        row.replacement = params[2];
        row.isActive = params[3];
        row.priority = params[4];
        row.updatedAt = params[5];
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    if (sql.startsWith("DELETE")) {
      const idx = rows.findIndex((r) => r.id === params[0]);
      if (idx >= 0) {
        rows.splice(idx, 1);
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    return { changes: 0 };
  },
  transaction(fn) {
    fn();
  },
};

vi.mock("../../src/lib/db/driver.js", () => ({
  getAdapter: async () => mockDb,
}));

const {
  createPromptFilter,
  getPromptFilters,
  getActiveFiltersByProvider,
  getCachedActiveFilters,
  updatePromptFilter,
  deletePromptFilter,
  __clearCache,
} = await import("../../src/lib/db/repos/promptFiltersRepo.js");

describe("promptFiltersRepo", () => {
  beforeEach(() => {
    rows.length = 0;
    __clearCache();
  });

  it("creates and retrieves a filter", async () => {
    const filter = await createPromptFilter({
      name: "test",
      provider: "codebuddy-cn",
      pattern: "Powerful AI Agent",
      replacement: "Advanced AI Agent",
      priority: 0,
    });
    expect(filter.id).toBeDefined();
    expect(filter.isActive).toBe(true);

    const all = await getPromptFilters();
    expect(all).toHaveLength(1);
    expect(all[0].pattern).toBe("Powerful AI Agent");
  });

  it("returns only active filters for a provider", async () => {
    await createPromptFilter({
      provider: "codebuddy-cn",
      pattern: "a",
      replacement: "b",
    });
    await createPromptFilter({
      provider: "codebuddy-cn",
      pattern: "c",
      replacement: "d",
      isActive: false,
    });
    await createPromptFilter({
      provider: "other",
      pattern: "e",
      replacement: "f",
    });

    const active = await getActiveFiltersByProvider("codebuddy-cn");
    expect(active).toHaveLength(1);
    expect(active[0].pattern).toBe("a");
  });

  it("serves cached filters synchronously after first load", async () => {
    await createPromptFilter({
      provider: "codebuddy-cn",
      pattern: "x",
      replacement: "y",
    });
    await getActiveFiltersByProvider("codebuddy-cn");

    const cached = getCachedActiveFilters("codebuddy-cn");
    expect(cached).toHaveLength(1);
    expect(cached[0].pattern).toBe("x");
  });

  it("returns empty array on cache miss without throwing", () => {
    const cached = getCachedActiveFilters("codebuddy-cn");
    expect(cached).toEqual([]);
  });

  it("invalidates cache on update", async () => {
    const filter = await createPromptFilter({
      provider: "codebuddy-cn",
      pattern: "old",
      replacement: "new",
    });
    await getActiveFiltersByProvider("codebuddy-cn");

    await updatePromptFilter(filter.id, { pattern: "updated" });

    const active = await getActiveFiltersByProvider("codebuddy-cn");
    expect(active[0].pattern).toBe("updated");
  });

  it("invalidates cache on delete", async () => {
    const filter = await createPromptFilter({
      provider: "codebuddy-cn",
      pattern: "del",
      replacement: "x",
    });
    await getActiveFiltersByProvider("codebuddy-cn");

    await deletePromptFilter(filter.id);

    const active = await getActiveFiltersByProvider("codebuddy-cn");
    expect(active).toHaveLength(0);
  });

  it("deletes a filter and returns true", async () => {
    const filter = await createPromptFilter({
      provider: "codebuddy-cn",
      pattern: "del",
      replacement: "x",
    });
    const success = await deletePromptFilter(filter.id);
    expect(success).toBe(true);

    const all = await getPromptFilters();
    expect(all).toHaveLength(0);
  });

  it("returns false when deleting a non-existent filter", async () => {
    const success = await deletePromptFilter("nonexistent");
    expect(success).toBe(false);
  });
});
