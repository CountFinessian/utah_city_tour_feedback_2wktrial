"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { transcribeBlob, type WhisperProgress } from "@/lib/whisper-client";

type Phase = "idle" | "recording" | "loading" | "transcribing";

export function Recorder({
  onText,
  serverAsr = true,
  variant = "compact",
}: {
  onText: (text: string) => void;
  serverAsr?: boolean;
  variant?: "compact" | "card";
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [dlPct, setDlPct] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function start() {
    setNote(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setNote("Voice input isn't available in this browser. Type your debrief below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimer();
        setSeconds(0);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await handleBlob(blob);
      };
      recorder.start();
      mediaRef.current = recorder;
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setNote("Microphone permission denied. Type your debrief below.");
      setPhase("idle");
    }
  }

  function stop() {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
  }

  async function handleBlob(blob: Blob) {
    if (serverAsr) {
      setPhase("transcribing");
      try {
        const fd = new FormData();
        fd.append("audio", blob, "debrief.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const json = await res.json();
        if (json.text) {
          onText(json.text as string);
          setPhase("idle");
          return;
        }
        if (!json.unavailable) {
          setNote(json.error || "Couldn't transcribe audio. Type below.");
          setPhase("idle");
          return;
        }
      } catch (err) {
        console.warn("[recorder] Server transcribe error, falling back to on-device:", err);
      }
    }
    await transcribeOnDevice(blob);
  }

  async function transcribeOnDevice(blob: Blob) {
    setPhase("loading");
    setDlPct(null);
    try {
      const text = await transcribeBlob(blob, (p: WhisperProgress) => {
        if (p.phase === "downloading") {
          setPhase("loading");
          setDlPct(p.pct ?? null);
        } else if (p.phase === "ready") {
          setDlPct(null);
          setPhase("transcribing");
        }
      });
      if (text) onText(text);
      else setNote("Didn't catch any speech — try again or type below.");
    } catch (err) {
      console.error("[whisper] on-device transcription failed:", err);
      setNote("Voice transcription unavailable. Type your debrief below.");
    } finally {
      setPhase("idle");
      setDlPct(null);
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const busy = phase === "loading" || phase === "transcribing";

  if (variant === "card") {
    return (
      <div className="w-full">
        {phase === "idle" && (
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="w-full min-h-[92px] px-5 py-4 flex items-center justify-between gap-4 text-left transition-all group bg-white/[0.02] hover:bg-white/[0.06] active:bg-white/[0.08]"
          >
            <div className="flex items-center gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-command-accent/15 text-command-accent border border-command-accent/25 group-hover:bg-command-accent group-hover:text-black group-hover:scale-105 transition-all shadow-sm">
                <Mic className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors">
                  Record Voice Debrief
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Tap anywhere to record · Fast Gemini transcription
                </div>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-command-accent/90 px-3 py-1.5 rounded-xl bg-command-accent/10 border border-command-accent/20 shrink-0 group-hover:bg-command-accent/20 transition-colors">
              Tap to record
            </span>
          </button>
        )}

        {phase === "recording" && (
          <div className="w-full min-h-[92px] px-5 py-4 flex items-center justify-between gap-4 bg-rose-500/10 border-rose-500/30 animate-in fade-in">
            <div className="flex items-center gap-3.5">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-300">Recording</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-rose-100">{mmss}</span>
                </div>
                <div className="flex items-center gap-1 h-3.5 mt-1">
                  <span className="w-1 h-2 bg-rose-400/80 rounded-full animate-pulse" />
                  <span className="w-1 h-4 bg-rose-400 rounded-full animate-pulse [animation-delay:150ms]" />
                  <span className="w-1 h-2.5 bg-rose-400/70 rounded-full animate-pulse [animation-delay:300ms]" />
                  <span className="w-1 h-4 bg-rose-400 rounded-full animate-pulse [animation-delay:75ms]" />
                  <span className="w-1 h-2 bg-rose-400/80 rounded-full animate-pulse [animation-delay:200ms]" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all shrink-0"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Finish Recording</span>
            </button>
          </div>
        )}

        {busy && (
          <div className="w-full min-h-[92px] px-5 py-4 flex items-center justify-center gap-3 text-center animate-in fade-in">
            <Loader2 className="h-5 w-5 animate-spin text-command-accent shrink-0" />
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200">
                {phase === "loading" && dlPct !== null
                  ? `Loading voice model… ${dlPct}%`
                  : "Transcribing audio..."}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Processing speech
              </div>
            </div>
          </div>
        )}

        {note && (
          <div className="p-3 pt-0">
            <p className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-2 text-center text-xs text-amber-200">
              {note}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      {phase === "idle" && (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="group flex items-center gap-2.5 px-4 py-2 rounded-full border border-command-border bg-white/[0.03] hover:bg-white/[0.08] hover:border-command-accent/50 text-command-ink text-xs font-semibold transition shadow-sm"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-command-accent/15 text-command-accent group-hover:bg-command-accent group-hover:text-black transition">
            <Mic className="h-3.5 w-3.5" />
          </span>
          <span>Record voice debrief</span>
        </button>
      )}

      {phase === "recording" && (
        <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300 shadow-sm animate-in fade-in">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums text-rose-200">{mmss}</span>
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-0.5 h-2 bg-rose-400/80 rounded-full animate-pulse" />
            <span className="w-0.5 h-3.5 bg-rose-400 rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="w-0.5 h-1.5 bg-rose-400/60 rounded-full animate-pulse [animation-delay:300ms]" />
            <span className="w-0.5 h-3 bg-rose-400/90 rounded-full animate-pulse [animation-delay:75ms]" />
          </div>
          <button
            type="button"
            onClick={stop}
            className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition shadow-sm"
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            <span>Finish</span>
          </button>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-command-border bg-white/[0.02] text-xs text-command-muted animate-in fade-in">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-command-accent" />
          <span className="font-medium text-command-soft">
            {phase === "loading" && dlPct !== null
              ? `Loading voice model… ${dlPct}%`
              : "Transcribing audio..."}
          </span>
        </div>
      )}

      {note && (
        <p className="max-w-md rounded-[8px] border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-200">
          {note}
        </p>
      )}
    </div>
  );
}
