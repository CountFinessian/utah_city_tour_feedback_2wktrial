"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Action = "load" | "clear-demo" | "reset-all" | "refresh";
type Feedback = { tone: "success" | "error" | "info"; message: string } | null;

const ACTION_COPY: Record<Action, string> = {
  load: "Loading demo data",
  "clear-demo": "Clearing demo data",
  "reset-all": "Resetting corpus",
  refresh: "Refreshing",
};

export function DigestActions({ hasData }: { hasData: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh(message = "View refreshed.") {
    setBusy("refresh");
    startTransition(() => router.refresh());
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setLastRefreshed(time);
    setFeedback({ tone: "success", message });
    setBusy(null);
  }

  async function run(action: Exclude<Action, "refresh">) {
    if (action === "reset-all" && !window.confirm("Delete ALL data, including real captures? This cannot be undone.")) {
      return;
    }
    setBusy(action);
    setFeedback({ tone: "info", message: `${ACTION_COPY[action]}...` });
    try {
      const url = action === "reset-all" ? "/api/seed?scope=all" : "/api/seed";
      const method = action === "load" ? "POST" : "DELETE";
      const res = await fetch(url, { method });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Action failed.");
      }
      startTransition(() => router.refresh());
      const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setLastRefreshed(time);
      const message =
        action === "load"
          ? "Demo data loaded."
          : action === "clear-demo"
            ? "Demo data cleared."
            : "All corpus data reset.";
      setFeedback({ tone: "success", message });
    } catch (err) {
      setFeedback({ tone: "error", message: err instanceof Error ? err.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null || isPending;

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {!hasData && (
          <button
            onClick={() => run("load")}
            disabled={working}
            className="btn btn-primary px-3 py-2 disabled:opacity-50"
          >
            {busy === "load" ? "Loading..." : "Load demo data"}
          </button>
        )}
        <button
          onClick={() => refresh()}
          disabled={working}
          className="btn px-3 py-2 disabled:opacity-50"
        >
          {busy === "refresh" ? "Refreshing..." : "Refresh"}
          {busy === "refresh" ? "Refreshing..." : "Refresh view"}
        </button>
        {hasData && (
          <button
            onClick={() => run("clear-demo")}
            disabled={working}
            className="btn px-3 py-2 text-muted disabled:opacity-50"
          >
            {busy === "clear-demo" ? "Clearing..." : "Clear demo data"}
          </button>
        )}
        {hasData && (
          <button
            onClick={() => run("reset-all")}
            disabled={working}
            className="btn btn-danger px-3 py-2 text-xs disabled:opacity-50"
          >
            {busy === "reset-all" ? "Resetting..." : "Reset all"}
            {busy === "reset-all" ? "Resetting..." : "Reset corpus"}
          </button>
        )}
      </div>
      <div className="min-h-5 text-xs text-muted">
        {feedback ? (
          <span className={feedback.tone === "error" ? "text-red-700" : feedback.tone === "success" ? "text-emerald-700" : ""}>
            {feedback.message}
          </span>
        ) : lastRefreshed ? (
          <span>Last refreshed {lastRefreshed}</span>
        ) : (
          <span>Data actions are applied to the current corpus.</span>
        )}
      </div>
    </div>
  );
}
