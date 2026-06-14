import { NextResponse } from "next/server";
import { getRecommendedWorkerCount } from "@/lib/systemSpecs";

export const dynamic = "force-dynamic";

/**
 * Returns host system specs and the recommended bulk-import worker count.
 * Used by the dashboard automation modals to power the "Auto by spec" mode.
 *
 * Response shape:
 * {
 *   recommended: number,
 *   limitedBy: "cpu" | "ram" | "fallback",
 *   ramBudget: number,
 *   cpuBudget: number,
 *   minWorkers: number,
 *   maxWorkers: number,
 *   ramGbPerWorker: number,
 *   cpuDivisor: number,
 *   specs: {
 *     cpuCount, cpuModel, totalMemGb, freeMemGb, platform, arch, ...
 *   }
 * }
 */
export async function GET() {
  try {
    const detail = getRecommendedWorkerCount();
    return NextResponse.json({
      success: true,
      ...detail,
      specs: {
        cpuCount: detail.specs.cpuCount,
        cpuModel: detail.specs.cpuModel,
        totalMemGb: Number(detail.specs.totalMemGb.toFixed(2)),
        freeMemGb: Number(detail.specs.freeMemGb.toFixed(2)),
        platform: detail.specs.platform,
        arch: detail.specs.arch,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to detect system specs",
      },
      { status: 500 }
    );
  }
}
