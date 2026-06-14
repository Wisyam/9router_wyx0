import { readQoderTokensForProbe, persistProbedPlanTiers } from "@/lib/merge/mergeService";
import { QoderService } from "@/lib/oauth/services/qoder";

export const dynamic = "force-dynamic";

const CONCURRENCY = 6;
const PER_REQUEST_TIMEOUT_MS = 12_000;

function normaliseTier(planTier) {
  const v = (planTier || "").toLowerCase().trim();
  if (!v) return "unknown";
  if (v === "pro" || v === "premium" || v === "paid") return "pro";
  if (v === "basic" || v === "trial" || v === "free") return "trial";
  return "unknown";
}

/**
 * POST body:
 *   {
 *     direction: "push"|"pull",
 *     externalDataDir: string,
 *     fingerprints?: string[],   // optional subset; default = all qoder rows on the source side
 *     persist?: boolean          // write planTier back to source DB (default true)
 *   }
 *
 * Streams NDJSON progress events:
 *   {"type":"start","total":N}
 *   {"type":"result","fingerprint":"qoder::a@b","tier":"pro","planTierRaw":"pro","status":"active","ok":true}
 *   {"type":"result","fingerprint":"qoder::c@d","tier":"unknown","ok":false,"error":"401"}
 *   {"type":"done","total":N,"ok":X,"persisted":Y}
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const direction = body.direction === "pull" ? "pull" : "push";
  const externalDataDir = body.externalDataDir || body.targetDataDir;
  const fingerprints = Array.isArray(body.fingerprints) ? body.fingerprints : null;
  const persist = body.persist !== false;

  if (!externalDataDir) {
    return new Response(JSON.stringify({ error: "externalDataDir required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let candidates;
  try {
    candidates = await readQoderTokensForProbe({
      direction,
      externalDataDir,
      fingerprints,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream NDJSON so the UI can render progress in real time
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {}
      };

      send({ type: "start", total: candidates.length });

      const svc = new QoderService();
      const updates = [];
      let okCount = 0;

      // Concurrency-limited worker pool
      let cursor = 0;
      const probeOne = async (idx) => {
        const c = candidates[idx];
        if (!c.accessToken) {
          send({
            type: "result",
            fingerprint: c.fingerprint,
            tier: "unknown",
            ok: false,
            error: "no-token",
          });
          return;
        }
        try {
          const controller2 = new AbortController();
          const timer = setTimeout(() => controller2.abort("timeout"), PER_REQUEST_TIMEOUT_MS);
          let plan = null;
          try {
            // QoderService.fetchUserPlan already wraps fetch with its own
            // 15s timeout, but we add an outer abort for safety.
            plan = await svc.fetchUserPlan(c.accessToken);
          } finally {
            clearTimeout(timer);
          }
          if (!plan) {
            send({
              type: "result",
              fingerprint: c.fingerprint,
              tier: "unknown",
              ok: false,
              error: "probe-failed",
            });
            return;
          }
          const planTierRaw = plan.plan_tier || plan.plan_tier_name || "";
          const status = plan.status || "";
          const tier = normaliseTier(planTierRaw);
          okCount++;
          updates.push({ id: c.id, planTier: planTierRaw, planStatus: status });
          send({
            type: "result",
            fingerprint: c.fingerprint,
            tier,
            planTierRaw,
            status,
            ok: true,
          });
        } catch (err) {
          send({
            type: "result",
            fingerprint: c.fingerprint,
            tier: "unknown",
            ok: false,
            error: err?.message || String(err),
          });
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
        while (cursor < candidates.length) {
          const i = cursor++;
          await probeOne(i);
        }
      });
      await Promise.all(workers);

      let persisted = 0;
      if (persist && updates.length > 0) {
        try {
          const r = await persistProbedPlanTiers({ direction, externalDataDir, updates });
          persisted = r.written || 0;
        } catch (err) {
          send({ type: "warn", message: `Persist failed: ${err.message}` });
        }
      }

      send({
        type: "done",
        total: candidates.length,
        ok: okCount,
        persisted,
      });
      try { controller.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
