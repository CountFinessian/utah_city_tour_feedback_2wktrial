import { hasASR } from "./model-config";

export type TranscribeResult =
  | { text: string }
  | { unavailable: true; message: string }
  | { error: string; detail?: string };

const UNAVAILABLE_MESSAGE =
  "Server transcription isn't configured. Using your browser's voice engine, or type below.";

export async function transcribeAudio(audio: Blob): Promise<TranscribeResult> {
  if (!hasASR()) {
    return { unavailable: true, message: UNAVAILABLE_MESSAGE };
  }

  const form = new FormData();
  form.append("file", audio, "debrief.webm");
  form.append("model", process.env.ASR_MODEL || "whisper-1");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
  } catch (err) {
    return { error: "Could not reach the transcription service.", detail: String(err) };
  }

  if (!res.ok) {
    return { error: "Transcription failed.", detail: await res.text().catch(() => "") };
  }

  const json = (await res.json().catch(() => ({}))) as { text?: string };
  return { text: json.text ?? "" };
}
