"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, Radio, ShieldCheck } from "lucide-react";
import { Recorder } from "./Recorder";
import { amenityLabel, objectionLabel, type Observation } from "@/domain/observation";

type AppState = "capture" | "structuring" | "review" | "follow_up" | "complete" | "failed";

const PROCESSING_MESSAGES = [
  "Cleaning transcript",
  "Extracting signals",
  "Checking evidence",
  "Preparing review",
];

function sentimentLabel(s: number): string {
  return ["Very negative", "Negative", "Neutral", "Positive", "Very positive"][s + 2] ?? "Neutral";
}

function coverageLabel(score: number): string {
  if (score >= 0.75) return "Complete";
  if (score >= 0.45) return "Usable with gaps";
  return "Needs follow-up";
}

export function MobileCaptureApp({ serverAsr = false }: { serverAsr?: boolean }) {
  const [hostName, setHostName] = useState("");
  const [floorPlan, setFloorPlan] = useState("");
  const [prospectTag, setProspectTag] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<Observation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!submitting) return;
    const timer = window.setInterval(() => {
      setProcessingIndex((idx) => Math.min(PROCESSING_MESSAGES.length - 1, idx + 1));
    }, 1300);
    return () => window.clearInterval(timer);
  }, [submitting]);

  const appState: AppState = useMemo(() => {
    if (error && !submitting) return "failed";
    if (submitting) return "structuring";
    if (!result) return "capture";
    if (result.extraction.followUpQuestions.length > 0 && result.extraction.coverageScore < 0.75) return "follow_up";
    return "review";
  }, [error, result, submitting]);

  const canSubmit = transcript.trim().length > 0 && !submitting;

  function appendText(text: string) {
    setTranscript((prev) => (prev ? `${prev} ${text}` : text));
  }

  async function submit(nextTranscript: string, id?: string) {
    setSubmitting(true);
    setProcessingIndex(0);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: nextTranscript, hostName, floorPlan, prospectTag, id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not structure debrief.");
        return;
      }
      setResult(json.observation as Observation);
      setTranscript(nextTranscript);
      setAnswers({});
      setNotice(id ? "Updated review ready." : "Review ready.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
      setProcessingIndex(0);
    }
  }

  function reset() {
    setTranscript("");
    setProspectTag("");
    setResult(null);
    setAnswers({});
    setError(null);
    setNotice(null);
  }

  function answerFollowUp(index: number) {
    if (!result) return;
    const answer = answers[index]?.trim();
    if (!answer) return;
    const question = result.extraction.followUpQuestions[index];
    void submit(`${transcript} Follow-up: ${question} ${answer}`.trim(), result.id);
  }

  return (
    <div className="mobile-demo-stage">
      <div className="mobile-product-note">
        <p className="command-label">Field product</p>
        <h1>Native-style mobile capture</h1>
        <p>
          Hosts should experience this as a focused phone app: talk, review, close gaps, done.
          Command remains the desktop leadership surface.
        </p>
        <Link href="/command" className="command-action-button mt-4 inline-flex">
          Open Command
        </Link>
      </div>

      <section className="phone-frame" aria-label="Utah City mobile capture app">
        <div className="phone-hardware">
          <div className="phone-statusbar">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <Radio className="h-3.5 w-3.5" />
              5G
            </span>
          </div>

          <div className="mobile-app-header">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-mobile-muted">Utah City</p>
              <h1>Guided tour debrief</h1>
            </div>
            <span className="mobile-ready-dot" />
          </div>

          <div className="mobile-trust-line">
            <ShieldCheck className="h-4 w-4" />
            {serverAsr ? "Server transcription ready" : "On-device voice ready"}
          </div>

          <MobileProgress state={appState} />

          <main className="mobile-app-screen">
            {!result ? (
              <CaptureScreen
                transcript={transcript}
                hostName={hostName}
                floorPlan={floorPlan}
                prospectTag={prospectTag}
                contextOpen={contextOpen}
                submitting={submitting}
                processingIndex={processingIndex}
                canSubmit={canSubmit}
                serverAsr={serverAsr}
                onText={appendText}
                onTranscript={setTranscript}
                onHostName={setHostName}
                onFloorPlan={setFloorPlan}
                onProspectTag={setProspectTag}
                onContextOpen={() => setContextOpen((value) => !value)}
                onSubmit={() => void submit(transcript.trim())}
              />
            ) : (
              <ReviewScreen
                observation={result}
                answers={answers}
                submitting={submitting}
                onAnswer={(index, value) => setAnswers((prev) => ({ ...prev, [index]: value }))}
                onSubmitAnswer={answerFollowUp}
                onReset={reset}
              />
            )}
          </main>

          {(notice || error) && (
            <div className={`mobile-toast ${error ? "mobile-toast-error" : ""}`}>
              {error || notice}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MobileProgress({ state }: { state: AppState }) {
  const steps = [
    ["capture", "Capture"],
    ["structuring", "Structure"],
    ["review", "Review"],
    ["follow_up", "Follow-up"],
  ] as const;
  const activeIndex = Math.max(0, steps.findIndex(([key]) => key === state));
  return (
    <div className="mobile-progress">
      {steps.map(([key, label], index) => (
        <span
          key={key}
          className={`mobile-progress-step ${index <= activeIndex ? "mobile-progress-step-active" : ""}`}
        >
          {index < activeIndex ? <Check className="h-3 w-3" /> : `${index + 1} ·`}
          {label}
        </span>
      ))}
    </div>
  );
}

function CaptureScreen({
  transcript,
  hostName,
  floorPlan,
  prospectTag,
  contextOpen,
  submitting,
  processingIndex,
  canSubmit,
  serverAsr,
  onText,
  onTranscript,
  onHostName,
  onFloorPlan,
  onProspectTag,
  onContextOpen,
  onSubmit,
}: {
  transcript: string;
  hostName: string;
  floorPlan: string;
  prospectTag: string;
  contextOpen: boolean;
  submitting: boolean;
  processingIndex: number;
  canSubmit: boolean;
  serverAsr: boolean;
  onText: (value: string) => void;
  onTranscript: (value: string) => void;
  onHostName: (value: string) => void;
  onFloorPlan: (value: string) => void;
  onProspectTag: (value: string) => void;
  onContextOpen: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4 pb-24">
      <section className="mobile-card mobile-voice-card">
        <Recorder serverAsr={serverAsr} onText={onText} />
      </section>

      <section className="mobile-card">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="mobile-transcript" className="mobile-section-label">Transcript</label>
          <span className="font-mono text-xs text-mobile-muted">{transcript.trim().length} chars</span>
        </div>
        <textarea
          id="mobile-transcript"
          value={transcript}
          onChange={(event) => onTranscript(event.target.value)}
          placeholder="Toured a couple with a dog. They loved the pool but parking was a concern..."
          className="mobile-textarea mt-3"
          rows={6}
        />
      </section>

      <section className="mobile-card">
        <button type="button" className="mobile-disclosure" onClick={onContextOpen}>
          <span>
            <span className="mobile-section-label block">Context</span>
            <span className="block text-xs text-mobile-muted">Host, unit, prospect tag</span>
          </span>
          <ChevronDown className={`h-4 w-4 transition ${contextOpen ? "rotate-180" : ""}`} />
        </button>
        {contextOpen && (
          <div className="mt-4 space-y-3">
            <MobileField label="Host" value={hostName} onChange={onHostName} placeholder="Maria" />
            <MobileField label="Floor plan" value={floorPlan} onChange={onFloorPlan} placeholder="B2 - 2 bed" />
            <MobileField label="Prospect tag" value={prospectTag} onChange={onProspectTag} placeholder="Couple + dog" />
          </div>
        )}
      </section>

      {submitting && (
        <section className="mobile-card border-mobile-accent/40">
          <p className="mobile-section-label">{PROCESSING_MESSAGES[processingIndex]}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-mobile-accent" />
          </div>
        </section>
      )}

      <div className="mobile-bottom-bar">
        <div>
          <p className="text-xs font-semibold text-mobile-ink">
            {canSubmit ? "Ready to structure" : "Add transcript to begin"}
          </p>
          <p className="text-[11px] text-mobile-muted">No forms required after capture.</p>
        </div>
        <button type="button" disabled={!canSubmit} onClick={onSubmit} className="mobile-primary-button">
          Structure debrief
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ReviewScreen({
  observation,
  answers,
  submitting,
  onAnswer,
  onSubmitAnswer,
  onReset,
}: {
  observation: Observation;
  answers: Record<number, string>;
  submitting: boolean;
  onAnswer: (index: number, value: string) => void;
  onSubmitAnswer: (index: number) => void;
  onReset: () => void;
}) {
  const e = observation.extraction;
  return (
    <div className="space-y-4 pb-24">
      <section className="mobile-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mobile-chip">{e.prospectIntent} lead</span>
          <span className="mobile-chip">{sentimentLabel(e.overallSentiment)}</span>
        </div>
        <h2 className="mt-4 text-xl font-black text-mobile-ink">Intelligence review</h2>
        <p className="mt-3 text-sm leading-7 text-mobile-soft">{e.summary}</p>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-mobile-muted">
            <span>Coverage</span>
            <span>{Math.round(e.coverageScore * 100)}% · {coverageLabel(e.coverageScore)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-mobile-accent" style={{ width: `${Math.round(e.coverageScore * 100)}%` }} />
          </div>
        </div>
      </section>

      <MobileSignalSection title="Objections">
        {e.objections.length === 0 ? (
          <p className="text-sm text-mobile-muted">No explicit objection captured.</p>
        ) : (
          e.objections.map((item, index) => (
            <div key={`${item.type}-${index}`} className="mobile-signal-row">
              <span>{objectionLabel(item.type)}</span>
              <span>{item.severity}</span>
            </div>
          ))
        )}
      </MobileSignalSection>

      <MobileSignalSection title="Amenity reactions">
        {e.amenities.length === 0 ? (
          <p className="text-sm text-mobile-muted">No amenity signal captured.</p>
        ) : (
          e.amenities.map((item, index) => (
            <div key={`${item.name}-${index}`} className="mobile-signal-row">
              <span>{amenityLabel(item.name)}</span>
              <span>{item.reaction}</span>
            </div>
          ))
        )}
      </MobileSignalSection>

      {e.followUpQuestions.length > 0 && (
        <section className="mobile-card border-mobile-warn/50">
          <p className="mobile-section-label">Follow-up</p>
          <div className="mt-3 space-y-3">
            {e.followUpQuestions.map((question, index) => (
              <div key={`${question}-${index}`} className="rounded-[16px] border border-white/10 bg-white/[0.035] p-3">
                <p className="text-sm font-semibold leading-6 text-mobile-ink">{question}</p>
                <textarea
                  value={answers[index] ?? ""}
                  onChange={(event) => onAnswer(index, event.target.value)}
                  className="mobile-textarea mt-3 min-h-20"
                  placeholder="Answer..."
                />
                <button
                  type="button"
                  disabled={submitting || !(answers[index] ?? "").trim()}
                  onClick={() => onSubmitAnswer(index)}
                  className="mobile-secondary-button mt-3 disabled:opacity-50"
                >
                  Apply answer
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mobile-bottom-bar">
        <button type="button" onClick={onReset} className="mobile-secondary-button">
          Log another tour
        </button>
        <Link href="/command" className="mobile-primary-button">
          Open Command
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function MobileSignalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mobile-card">
      <h3 className="mobile-section-label">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function MobileField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mobile-section-label">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mobile-input mt-2"
      />
    </label>
  );
}
