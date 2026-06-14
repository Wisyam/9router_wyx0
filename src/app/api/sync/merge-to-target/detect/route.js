import path from "node:path";
import { NextResponse } from "next/server";
import { detectLocalInstances } from "@/lib/merge/findTargetDb";
import { DATA_DIR } from "@/lib/dataDir";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const instances = detectLocalInstances();
    const currentResolved = path.resolve(DATA_DIR);

    const filtered = instances.filter(
      (inst) => path.resolve(inst.dataDir) !== currentResolved,
    );

    return NextResponse.json({
      currentDataDir: currentResolved,
      detected: filtered,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Detection failed" },
      { status: 500 },
    );
  }
}
