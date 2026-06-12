import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/dataDir";

const HISTORY_DIR = path.join(DATA_DIR, "merge-history");
const MAX_HISTORY = 20;

function ensureHistoryDir() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

export function saveMergeReport(report) {
  ensureHistoryDir();
  const filename = `merge-${report.timestamp.replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(HISTORY_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");
  pruneOldReports();
}

function pruneOldReports() {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter((f) => f.startsWith("merge-") && f.endsWith(".json"))
      .map((f) => ({
        name: f,
        full: path.join(HISTORY_DIR, f),
        mtime: fs.statSync(path.join(HISTORY_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_HISTORY)) {
      try { fs.unlinkSync(old.full); } catch {}
    }
  } catch {}
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    ensureHistoryDir();
    const files = fs.readdirSync(HISTORY_DIR)
      .filter((f) => f.startsWith("merge-") && f.endsWith(".json"))
      .sort()
      .reverse();

    const reports = files.map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), "utf8"));
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to read merge history" },
      { status: 500 },
    );
  }
}
