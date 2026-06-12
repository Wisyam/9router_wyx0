import { NextResponse } from "next/server";
import { executeMerge, saveMergeReport } from "@/lib/merge/mergeService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { targetDataDir, strategy, dryRun, providerFilter } = body;

    if (!targetDataDir) {
      return NextResponse.json(
        { error: "targetDataDir is required" },
        { status: 400 },
      );
    }

    const report = await executeMerge({
      targetDataDir,
      strategy: strategy === "add-as-new" ? "add-as-new" : "skip",
      dryRun: dryRun !== false,
      providerFilter: Array.isArray(providerFilter) ? providerFilter : null,
    });

    if (!dryRun) {
      try { saveMergeReport(report); } catch {}
    }

    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Merge failed" },
      { status: 500 },
    );
  }
}
