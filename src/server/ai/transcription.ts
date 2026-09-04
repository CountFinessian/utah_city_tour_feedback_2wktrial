import { hasASR, hasGoogleKey } from "./model-config";

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

  // 1. Preferred & Fastest: Google Gemini Flash Multimodal Transcription (~800ms)
  if (hasGoogleKey()) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    try {
      const buffer = Buffer.from(await audio.arrayBuffer());
      const base64 = buffer.toString("base64");
      const rawMime = audio.type || "audio/webm";
      const mimeType = rawMime.split(";")[0] || "audio/webm";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe this audio debrief verbatim. Return ONLY the transcribed text. Do not add quotes, commentary, formatting, or timestamps.",
                },
                {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.0,
          },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (text) {
          return { text };
        }
      } else {
        const errText = await res.text().catch(() => "");
        console.warn("[transcription] Gemini audio transcription returned non-200:", errText);
      }
    } catch (err) {
      console.warn("[transcription] Gemini transcription error, attempting fallback...", err instanceof Error ? err.message : err);
    }
  }

  // 2. OpenAI Whisper fallback if OPENAI_API_KEY is configured
  if (process.env.OPENAI_API_KEY) {
    const form = new FormData();
    form.append("file", audio, "debrief.webm");
    form.append("model", process.env.ASR_MODEL || "whisper-1");

    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { text?: string };
        if (json.text) return { text: json.text.trim() };
      } else {
        return { error: "Transcription failed.", detail: await res.text().catch(() => "") };
      }
    } catch (err) {
      return { error: "Could not reach the transcription service.", detail: String(err) };
    }
  }

  return { error: "Transcription service unavailable. Please type your debrief." };
}
