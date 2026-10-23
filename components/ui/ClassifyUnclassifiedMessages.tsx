"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClassifyUnclassifiedMessages({
  chatbotId,
}: {
  chatbotId: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  async function classifyBatch() {
    setRunning(true);
    setStatus("");
    try {
      const response = await fetch("/api/analytics/classify-unclassified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatbotId }),
      });
      const result = (await response.json()) as {
        classified?: number;
        failed?: number;
        remaining?: number;
        failureReason?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Could not classify messages");
      }
      setStatus(
        `${result.classified ?? 0} classified, ${result.failed ?? 0} failed. ` +
          `${result.remaining ?? 0} unclassified messages remain.` +
          (result.failureReason ? ` ${result.failureReason}` : ""),
      );
      if (result.classified) router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not classify messages",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={classifyBatch}
        disabled={running}
        className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:cursor-wait disabled:opacity-60"
      >
        {running ? "Classifying messages…" : "Classify existing messages"}
      </button>
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
