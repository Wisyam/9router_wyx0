import { NextResponse } from "next/server";
import { detectLocalInstances } from "@/lib/merge/findTargetDb";
import { DATA_DIR } from "@/lib/dataDir";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const instances = detectLocalInstances();

    const filtered = instances.filter((inst) => inst.dataDir !== DATA_DIR);

    return NextResponse.json({
      currentDataDir: DATA_DIR,
      detected: filtered,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Detection failed" },
      { status: 500 },
    );
  }
}
