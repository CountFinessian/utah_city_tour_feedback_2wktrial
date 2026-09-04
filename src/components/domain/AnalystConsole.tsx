"use client";

import { useState } from "react";
import { Bot, Loader2, Send, Sparkles, Zap, BookOpen, Scale } from "lucide-react";
import { ConfidenceBadge } from "./CommandComponents";
import { EvidencePopover, type EvidenceItem } from "./EvidencePopover";

type AnalystResponse = {
  answer: string;
  confidence: "low" | "medium" | "high";
  sampleSize: number;
  evidence: EvidenceItem[];
  suggestedActions: string[];
  metrics?: {
    latencyMs: number;
    tokenCount?: number;
    mode: "agentic" | "rag";
  };
};

type ComparisonResult = {
  mode: "compare";
  agentic: AnalystResponse;
  rag: AnalystResponse;
};

type MessageItem = {
  question: string;
  response: AnalystResponse | ComparisonResult;
};

const prompts = [
  "Why are tours not converting?",
  "Summarize every objection about parking.",
  "Which amenities matter most right now?",
  "What should leadership focus on this week?",
];

export function AnalystConsole() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"agentic" | "rag" | "compare">("agentic");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setQuestion("");
    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analyst failed.");
      setMessages((prev) => [{ question: trimmed, response: json }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyst failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="command-panel min-h-[560px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-command-border pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[8px] bg-command-accent/15 text-command-accent">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <p className="command-label">AI Analyst</p>
              <h2 className="text-lg font-semibold text-command-ink">Ask the operational corpus</h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-[8px] border border-command-border bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => setMode("agentic")}
              className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-all ${
                mode === "agentic"
                  ? "bg-command-accent/20 text-command-accent border border-command-accent/40 shadow-sm"
                  : "text-command-soft hover:text-command-ink"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Agentic
            </button>
            <button
              type="button"
              onClick={() => setMode("rag")}
              className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-all ${
                mode === "rag"
                  ? "bg-command-accent/20 text-command-accent border border-command-accent/40 shadow-sm"
                  : "text-command-soft hover:text-command-ink"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              One-Shot RAG
            </button>
            <button
              type="button"
              onClick={() => setMode("compare")}
              className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-all ${
                mode === "compare"
                  ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                  : "text-command-soft hover:text-command-ink"
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
              Compare Both
            </button>
          </div>
        </div>

        <form
          className="mt-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask why sentiment changed, what objections are rising, or what leadership should inspect..."
            className="analyst-input"
          />
          <button type="submit" disabled={busy || !question.trim()} className="btn btn-primary px-4 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4" />}
          </button>
        </form>

        {error && <p className="mt-3 rounded-[8px] border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

        {busy && (
          <div className="mt-4 space-y-2 rounded-[8px] border border-command-border/70 bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between text-xs text-command-soft">
              <span className="font-semibold text-command-accent flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {mode === "compare"
                  ? "Running Agentic & One-Shot RAG in parallel for comparison..."
                  : mode === "agentic"
                    ? "Executing Agentic Retrieval..."
                    : "Querying with One-Shot RAG..."}
              </span>
              <span className="text-command-muted text-[11px]">Benchmarking latency</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-command-border/40">
              <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-command-accent" />
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {messages.length === 0 ? (
            <div className="rounded-[8px] border border-command-border bg-white/[0.025] p-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-command-accent" />
              <p className="mt-3 text-sm font-semibold text-command-ink">No analyst thread yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-command-muted">
                Ask a leadership question. Toggle between Agentic Retrieval and One-Shot RAG, or run them side-by-side to compare latency and accuracy.
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const isCompare = "mode" in message.response && message.response.mode === "compare";

              if (isCompare) {
                const comp = message.response as ComparisonResult;
                return (
                  <article key={`${message.question}-${index}`} className="analyst-message space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-command-border/50 pb-3">
                      <p className="text-sm font-semibold text-command-accent">Q: {message.question}</p>
                      <span className="rounded-[4px] border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
                        Side-by-Side Comparison
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {/* Agentic Card */}
                      <div className="rounded-[8px] border border-command-accent/30 bg-command-panel/60 p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-command-border/40 pb-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-command-accent">
                            <Zap className="h-3.5 w-3.5" />
                            Agentic Retrieval
                          </div>
                          {comp.agentic.metrics && (
                            <span className="rounded bg-command-accent/15 px-2 py-0.5 text-xs font-semibold text-command-accent">
                              {comp.agentic.metrics.latencyMs} ms
                            </span>
                          )}
                        </div>
                        <div className="text-sm leading-relaxed text-command-ink whitespace-pre-wrap font-normal">
                          {comp.agentic.answer}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-command-border/30">
                          <ConfidenceBadge level={comp.agentic.confidence} sampleSize={comp.agentic.sampleSize} />
                          {comp.agentic.evidence && comp.agentic.evidence.length > 0 && (
                            <EvidencePopover count={comp.agentic.evidence.length} items={comp.agentic.evidence} />
                          )}
                        </div>
                      </div>

                      {/* RAG Card */}
                      <div className="rounded-[8px] border border-command-border bg-command-panel/40 p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-command-border/40 pb-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-command-soft">
                            <BookOpen className="h-3.5 w-3.5" />
                            One-Shot RAG
                          </div>
                          {comp.rag.metrics && (
                            <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-command-soft">
                              {comp.rag.metrics.latencyMs} ms
                            </span>
                          )}
                        </div>
                        <div className="text-sm leading-relaxed text-command-ink whitespace-pre-wrap font-normal">
                          {comp.rag.answer}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-command-border/30">
                          <ConfidenceBadge level={comp.rag.confidence} sampleSize={comp.rag.sampleSize} />
                          {comp.rag.evidence && comp.rag.evidence.length > 0 && (
                            <EvidencePopover count={comp.rag.evidence.length} items={comp.rag.evidence} />
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              }

              const single = message.response as AnalystResponse;
              const isAgentic = single.metrics?.mode === "agentic";

              return (
                <article key={`${message.question}-${index}`} className="analyst-message">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-command-accent">Q: {message.question}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-[4px] px-2 py-0.5 text-xs font-semibold ${
                        isAgentic
                          ? "border border-command-accent/40 bg-command-accent/10 text-command-accent"
                          : "border border-command-border bg-white/5 text-command-soft"
                      }`}>
                        {isAgentic ? "⚡ Agentic" : "📚 One-Shot RAG"}
                      </span>
                      {single.metrics && (
                        <span className="rounded bg-command-border/50 px-2 py-0.5 text-xs text-command-soft">
                          {single.metrics.latencyMs} ms
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 text-base leading-relaxed text-command-ink whitespace-pre-wrap font-normal">
                    {single.answer}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <ConfidenceBadge level={single.confidence} sampleSize={single.sampleSize} />
                    {single.evidence && single.evidence.length > 0 && (
                      <EvidencePopover count={single.evidence.length} items={single.evidence} />
                    )}
                  </div>
                  <div className="mt-4 border-t border-command-border pt-4">
                    <p className="command-label">Push to action</p>
                    <ul className="mt-2 space-y-1 text-sm text-command-soft">
                      {single.suggestedActions.map((action) => (
                        <li key={action}>• {action}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="command-panel">
          <p className="command-label">Starter prompts</p>
          <div className="mt-4 space-y-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void ask(prompt)}
                className="w-full rounded-[8px] border border-command-border bg-white/[0.025] px-3 py-3 text-left text-sm font-semibold text-command-soft hover:border-command-accent/50 hover:text-command-ink"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="command-panel">
          <p className="command-label">Retrieval Architecture</p>
          <p className="mt-3 text-sm leading-relaxed text-command-soft">
            <strong className="text-command-ink">Agentic Retrieval</strong> queries specific debriefs iteratively with precision tools. <strong className="text-command-ink">One-Shot RAG</strong> passes the full corpus snapshot into context. Compare side-by-side to benchmark latency and quality.
          </p>
        </section>
      </aside>
    </div>
  );
}
