"use client";

import { useCallback, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import Input from "./Input";
import { cn } from "@/shared/utils/cn";

function StatusPill({ action }) {
  if (action === "add") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
        <span className="material-symbols-outlined text-[14px]">add_circle</span>
        New
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-2 py-0.5 text-xs font-medium text-text-muted">
      <span className="material-symbols-outlined text-[14px]">skip_next</span>
      Skip
    </span>
  );
}

export default function MergeConnectionsModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState("push"); // "push" = this → other, "pull" = other → this
  const [targetDir, setTargetDir] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setStep(1);
    setDirection("push");
    setTargetDir("");
    setDetected([]);
    setLoading(false);
    setExecuting(false);
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/merge-to-target/detect");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Detection failed");
      setDetected(data.detected || []);
      if (data.detected?.length === 1) {
        setTargetDir(data.detected[0].dataDir);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDetecting(false);
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!targetDir.trim()) {
      setError("Please enter the other instance's data directory path");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/merge-to-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          externalDataDir: targetDir.trim(),
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [direction, targetDir]);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/merge-to-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          externalDataDir: targetDir.trim(),
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  }, [direction, targetDir]);

  const isPull = direction === "pull";
  const otherLabel = isPull ? "Source" : "Target";
  const titleVerb = isPull ? "Import from" : "Export to";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Merge Connections" size="lg">
      <div className="flex flex-col gap-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <span className="material-symbols-outlined text-[18px] text-red-500 mt-0.5 shrink-0">error</span>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {step === 1 && (
          <>
            {/* Direction toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-main">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("push")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    direction === "push"
                      ? "border-primary bg-primary/5 text-text-main"
                      : "border-border bg-bg hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">upload</span>
                    <span className="text-sm font-medium">Push</span>
                  </div>
                  <p className="text-[11px] text-text-muted">This instance → other instance</p>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("pull")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    direction === "pull"
                      ? "border-primary bg-primary/5 text-text-main"
                      : "border-border bg-bg hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span className="text-sm font-medium">Pull</span>
                  </div>
                  <p className="text-[11px] text-text-muted">Other instance → this instance</p>
                </button>
              </div>
            </div>

            <p className="text-sm text-text-muted">
              {isPull
                ? "Import provider connections from another 9router instance into this one. Duplicate accounts (same provider + email) are skipped automatically."
                : "Transfer provider connections to another 9router instance on this machine. Duplicate accounts (same provider + email) are skipped automatically."}
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-main">
                {isPull ? "Source DATA_DIR (other instance)" : "Target DATA_DIR (other instance)"}
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. C:\Users\akbar\AppData\Roaming\9router"
                  value={targetDir}
                  onChange={(e) => setTargetDir(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" icon="radar" onClick={handleDetect} loading={detecting}>
                  Detect
                </Button>
              </div>
            </div>

            {detected.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-text-muted">Detected instances:</p>
                {detected.map((inst) => (
                  <button
                    key={inst.dataDir}
                    type="button"
                    onClick={() => setTargetDir(inst.dataDir)}
                    className={cn(
                      "flex items-center gap-2 w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      targetDir === inst.dataDir
                        ? "border-primary bg-primary/5 text-text-main"
                        : "border-border bg-bg hover:border-primary/40"
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0">folder</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs truncate">{inst.dataDir}</p>
                      <p className="text-[11px] text-text-muted">{inst.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button variant="primary" icon="search" onClick={handlePreview} loading={loading} disabled={!targetDir.trim()}>
                Preview {isPull ? "Import" : "Export"}
              </Button>
            </div>
          </>
        )}

        {step === 2 && preview && (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-bg border border-border px-3 py-2">
              <span className="material-symbols-outlined text-[18px] text-primary">
                {isPull ? "download" : "upload"}
              </span>
              <p className="text-xs text-text-muted">
                <span className="font-medium text-text-main">{titleVerb}</span>{" "}
                <span className="font-mono">{preview.sourceDataDir || "?"}</span>
                {" → "}
                <span className="font-mono">{preview.targetDataDir || "?"}</span>
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div className="rounded-lg bg-bg border border-border p-2.5 text-center">
                <p className="text-base font-bold text-text-main">{preview.summary.totalSource}</p>
                <p className="text-[10px] text-text-muted">Source</p>
              </div>
              <div className="rounded-lg bg-bg border border-border p-2.5 text-center">
                <p className="text-base font-bold text-text-main">{preview.summary.totalTarget}</p>
                <p className="text-[10px] text-text-muted">{otherLabel === "Source" ? "Target (this)" : "Target"}</p>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5 text-center">
                <p className="text-base font-bold text-green-600 dark:text-green-400">+{preview.summary.toAdd}</p>
                <p className="text-[10px] text-green-600 dark:text-green-400">To Add</p>
              </div>
              <div className="rounded-lg bg-bg border border-border p-2.5 text-center">
                <p className="text-base font-bold text-text-muted">{preview.summary.toSkip}</p>
                <p className="text-[10px] text-text-muted">Duplicates</p>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-center">
                <p className="text-base font-bold text-primary">{preview.summary.afterMerge}</p>
                <p className="text-[10px] text-primary">After Merge</p>
              </div>
            </div>

            {preview.providerBreakdown?.length > 0 && (
              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-bg">
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs font-medium text-text-muted">Provider</th>
                      <th className="px-3 py-2 text-xs font-medium text-text-muted text-center">Source</th>
                      <th className="px-3 py-2 text-xs font-medium text-text-muted text-center">Target</th>
                      <th className="px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400 text-center">+ Add</th>
                      <th className="px-3 py-2 text-xs font-medium text-text-muted text-center">Skip</th>
                      <th className="px-3 py-2 text-xs font-medium text-primary text-center">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.providerBreakdown.map((row) => (
                      <tr key={row.provider} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-1.5 text-xs font-mono font-medium">{row.provider}</td>
                        <td className="px-3 py-1.5 text-xs text-center">{row.source || <span className="text-text-muted">—</span>}</td>
                        <td className="px-3 py-1.5 text-xs text-center">{row.target || <span className="text-text-muted">—</span>}</td>
                        <td className="px-3 py-1.5 text-xs text-center text-green-600 dark:text-green-400 font-medium">
                          {row.toAdd > 0 ? `+${row.toAdd}` : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-center text-text-muted">
                          {row.toSkip > 0 ? row.toSkip : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-center font-bold text-primary">{row.afterMerge}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-bg font-semibold">
                    <tr className="border-t border-border">
                      <td className="px-3 py-2 text-xs text-text-muted">Total</td>
                      <td className="px-3 py-2 text-xs text-center">{preview.summary.totalSource}</td>
                      <td className="px-3 py-2 text-xs text-center">{preview.summary.totalTarget}</td>
                      <td className="px-3 py-2 text-xs text-center text-green-600 dark:text-green-400">+{preview.summary.toAdd}</td>
                      <td className="px-3 py-2 text-xs text-center text-text-muted">{preview.summary.toSkip}</td>
                      <td className="px-3 py-2 text-xs text-center text-primary">{preview.summary.afterMerge}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {preview.summary.toAdd === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-bg border border-border px-3 py-4">
                <span className="material-symbols-outlined text-text-muted">check_circle</span>
                <p className="text-sm text-text-muted">All accounts already exist in the target. Nothing to merge.</p>
              </div>
            ) : (
              <details className="group">
                <summary className="flex items-center gap-1 cursor-pointer text-xs text-text-muted hover:text-text-main transition-colors">
                  <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">chevron_right</span>
                  Show {preview.details?.length || 0} account details
                </summary>
                <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-bg">
                      <tr className="border-b border-border text-left">
                        <th className="px-3 py-2 text-xs font-medium text-text-muted">Status</th>
                        <th className="px-3 py-2 text-xs font-medium text-text-muted">Provider</th>
                        <th className="px-3 py-2 text-xs font-medium text-text-muted">Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.details.map((d, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-1.5"><StatusPill action={d.action} /></td>
                          <td className="px-3 py-1.5 text-xs font-mono">{d.provider}</td>
                          <td className="px-3 py-1.5 text-xs truncate max-w-[180px]">{d.email || d.name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button
                variant="primary"
                icon={isPull ? "download" : "merge_type"}
                onClick={handleExecute}
                loading={executing}
                disabled={!preview.summary.toAdd}
              >
                {isPull ? "Import" : "Merge"} {preview.summary.toAdd} Connection{preview.summary.toAdd !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        )}

        {step === 3 && result && (
          <>
            <div className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3",
              result.errors?.length ? "border-red-500/20 bg-red-500/10" : "border-green-500/20 bg-green-500/10"
            )}>
              <span className={cn(
                "material-symbols-outlined text-[22px] mt-0.5 shrink-0",
                result.errors?.length ? "text-red-500" : "text-green-500"
              )}>
                {result.errors?.length ? "warning" : "check_circle"}
              </span>
              <div>
                <p className={cn(
                  "font-medium text-sm",
                  result.errors?.length ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  {result.errors?.length
                    ? `${isPull ? "Import" : "Merge"} completed with errors`
                    : `Successfully ${isPull ? "imported" : "merged"} ${result.summary.toAdd} connection${result.summary.toAdd !== 1 ? "s" : ""}!`}
                </p>
                {result.errors?.map((e, i) => (
                  <p key={i} className="text-xs text-red-500 mt-1">{e}</p>
                ))}
              </div>
            </div>

            {result.backupPath && (
              <div className="flex items-start gap-2 rounded-lg bg-bg border border-border px-3 py-2">
                <span className="material-symbols-outlined text-[16px] text-text-muted mt-0.5 shrink-0">backup</span>
                <p className="text-xs text-text-muted">
                  Backup saved: <span className="font-mono break-all">{result.backupPath}</span>
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="primary" onClick={handleClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
