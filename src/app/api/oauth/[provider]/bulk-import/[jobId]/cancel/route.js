import { NextResponse } from "next/server";
import { getBulkImportProviderSpec } from "@/lib/oauth/services/bulkImportRegistry";

export const dynamic = "force-dynamic";

export async function POST(_request, { params }) {
  const { provider, jobId } = await params;

  let spec;
  try {
    spec = getBulkImportProviderSpec(provider);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const manager = await spec.getManager();
  const job = await manager.cancelJob(jobId);

  if (!job) {
    return NextResponse.json({ error: `${spec.errorLabel} not found` }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}
