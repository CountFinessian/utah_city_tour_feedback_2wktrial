import { hasASR, hasLLM, llmLabel } from "@/server/ai/model-config";
import { backendName } from "@/server/repositories/observations";

export function getPlatformStatus() {
  return {
    ok: true,
    storage: backendName,
    extraction: hasLLM() ? "llm" : "heuristic",
    model: llmLabel(),
    transcription: hasASR() ? "openai" : "on-device",
    architecture: "modular-monolith",
  };
}
