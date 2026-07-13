"use client";

import { useRef, useState } from "react";
import { transcribeBlob, type WhisperProgress } from "@/lib/whisper-client";

/**
 * One-tap voice capture. Records audio in the browser, then transcribes it:
 *   • If the server has Whisper configured (serverAsr), POST to /api/transcribe.
 *   • Otherwise transcribe ON-DEVICE with transformers.js (Whisper) — no key, no
 *     server, fully private. The model downloads once (progress shown) and is cached.
 * Typing always works as a fallback; capture never blocks.
 */

type Phase = "idle" | "recording" | "loading" | "transcribing";

export function Recorder({
  onText,
  serverAsr = false,
}: {
  onText: (text: string) => void;
  serverAsr?: boolean;
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
        // Server said unavailable → fall through to on-device.
        if (!json.unavailable) {
          setNote(json.error || "Couldn't transcribe. Type below.");
          setPhase("idle");
          return;
        }
      } catch {
        // network issue → fall through to on-device
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
      else setNote("Didn't catch any speech — try again, or type below.");
    } catch (err) {
      console.error("[whisper] on-device transcription failed:", err);
      setNote("Couldn't run on-device transcription here. Type your debrief below.");
    } finally {
      setPhase("idle");
      setDlPct(null);
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const busy = phase === "loading" || phase === "transcribing";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={phase === "recording" ? stop : start}
        disabled={busy}
        aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
        className={[
          "relative grid h-24 w-24 place-items-center rounded-full border text-white transition",
          "shadow-[0_16px_34px_rgba(15,23,42,0.18)]",
          phase === "recording" ? "border-red-500 bg-red-600" : "border-accent bg-accent hover:bg-accent-strong",
          busy ? "opacity-70" : "",
        ].join(" ")}
      >
        {phase === "recording" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-red-600/40" />
        )}
        {busy ? (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : phase === "recording" ? (
          <span className="h-6 w-6 rounded-sm bg-white" />
        ) : (
          <MicIcon />
        )}
      </button>

      <div className="min-h-5 text-center text-sm font-medium text-muted">
        {phase === "recording" ? (
          <span className="font-mono tabular-nums text-red-700">Recording {mmss} - tap to stop</span>
        ) : phase === "loading" ? (
          <span>{dlPct !== null ? `Loading voice model… ${dlPct}%` : "Loading voice model…"}</span>
        ) : phase === "transcribing" ? (
          <span>Transcribing on device…</span>
        ) : (
          <span>Tap and talk — transcribed privately on your device</span>
        )}
      </div>

      {phase === "loading" && dlPct !== null && (
        <div className="progress-track w-56">
          <div className="progress-fill transition-all" style={{ width: `${dlPct}%` }} />
        </div>
      )}

      {note && <p className="max-w-md rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">{note}</p>}
      {phase === "idle" && !note && !serverAsr && (
        <p className="max-w-md text-center text-xs leading-relaxed text-muted">
          First recording downloads a small voice model (~once per device). No API key, no cloud.
        </p>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
