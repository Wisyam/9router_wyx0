"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/shared/components/Button";
import Card from "@/shared/components/Card";
import MergeConnectionsModal from "@/shared/components/MergeConnectionsModal";

export default function MergeConnectionsPage() {
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/merge-to-target/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.reports || []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleMergeSuccess = useCallback(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">Merge Connections</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Transfer provider connections from this instance to another 9router on the same machine.
          Duplicate accounts (same provider + email) are automatically skipped.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span className="material-symbols text-3xl text-primary">merge_type</span>
          <div className="flex-1">
            <h2 className="font-semibold text-fg">Cross-Instance Merge</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Scan and merge your Kiro, CodeBuddy, and other provider accounts to another 9router instance.
              The target database is backed up automatically before any changes.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={() => setShowModal(true)}>
                Start Merge
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {history.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-fg">Merge History</h2>
          <div className="space-y-2">
            {history.slice(0, 10).map((report, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-mono text-xs text-fg-muted">
                    {new Date(report.timestamp).toLocaleString()}
                  </span>
                  <span className="mx-2 text-fg-muted">→</span>
                  <span className="font-mono text-xs">{report.targetDataDir}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-success">+{report.summary?.toAdd || 0}</span>
                  <span className="text-fg-muted">skip {report.summary?.toSkip || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <MergeConnectionsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleMergeSuccess}
      />
    </div>
  );
}
