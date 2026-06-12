"use client";

import { useCallback, useState } from "react";
import Badge from "./Badge";
import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";

function ActionBadge({ action }) {
  const variants = { add: "success", skip: "default" };
  const labels = { add: "NEW", skip: "SKIP" };
  return <Badge variant={variants[action] || "default"} size="sm">{labels[action] || action}</Badge>;
}

ActionBadge.displayName = "ActionBadge";

export default function MergeConnectionsModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
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
      setError("Please enter the target data directory path");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/merge-to-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDataDir: targetDir.trim(), dryRun: true }),
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
  }, [targetDir]);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/merge-to-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDataDir: targetDir.trim(), dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      setResult(data);
      setStep(3);
      if (onSuccess) onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  }, [targetDir, onSuccess]);

  const footer = (
    <div className="flex justify-end gap-2">
      {step === 1 && (
        <>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handlePreview} disabled={!targetDir.trim() || loading}>
            {loading ? "Scanning..." : "Preview Merge"}
          </Button>
        </>
      )}
      {step === 2 && (
        <>
          <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
          <Button
            variant="primary"
            onClick={handleExecute}
            disabled={executing || !preview?.summary?.toAdd}
          >
            {executing ? "Merging..." : `Merge ${preview?.summary?.toAdd || 0} Connections`}
          </Button>
        </>
      )}
      {step === 3 && (
        <Button variant="primary" onClick={handleClose}>Done</Button>
      )}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Merge Connections to Another Instance" size="xl" footer={footer}>
      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Merge provider connections from this instance to another 9router running on the same machine.
            Duplicates (same provider + email) will be skipped automatically.
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Target 9router DATA_DIR"
                placeholder="e.g. C:\Users\akbar\AppData\Roaming\9router"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={handleDetect} disabled={detecting}>
              {detecting ? "Detecting..." : "Auto-Detect"}
            </Button>
          </div>

          {detected.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-fg-muted">Detected instances:</p>
              {detected.map((inst) => (
                <button
                  key={inst.dataDir}
                  type="button"
                  className="w-full rounded border border-border px-3 py-2 text-left text-sm hover:border-primary/40 hover:bg-primary/5"
                  onClick={() => setTargetDir(inst.dataDir)}
                >
                  <span className="font-mono text-xs">{inst.dataDir}</span>
                  <span className="ml-2 text-xs text-fg-muted">({inst.label})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-3">
          <div className="flex gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-center">
              <div className="text-lg font-bold text-fg">{preview.summary.totalSource}</div>
              <div className="text-xs text-fg-muted">Source</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-fg">{preview.summary.totalTarget}</div>
              <div className="text-xs text-fg-muted">Target (existing)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-success">{preview.summary.toAdd}</div>
              <div className="text-xs text-success">To Add</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-fg-muted">{preview.summary.toSkip}</div>
              <div className="text-xs text-fg-muted">Duplicates</div>
            </div>
          </div>

          {preview.summary.toAdd === 0 && (
            <p className="text-sm text-fg-muted">
              No new connections to merge — all accounts already exist in the target instance.
            </p>
          )}

          {preview.details?.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Email / Name</th>
                    <th className="px-3 py-2">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.details.map((d, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-1.5"><ActionBadge action={d.action} /></td>
                      <td className="px-3 py-1.5 font-mono text-xs">{d.provider}</td>
                      <td className="px-3 py-1.5">{d.email || d.name || "—"}</td>
                      <td className="px-3 py-1.5 text-xs text-fg-muted">{d.authType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-3">
          <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3">
            <p className="font-medium text-success">
              Merge complete! {result.summary.toAdd} connection{result.summary.toAdd !== 1 ? "s" : ""} added.
            </p>
          </div>
          {result.backupPath && (
            <p className="text-xs text-fg-muted">
              Backup saved: <span className="font-mono">{result.backupPath}</span>
            </p>
          )}
          {result.errors?.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {result.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

MergeConnectionsModal.displayName = "MergeConnectionsModal";
