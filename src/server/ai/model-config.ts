import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const GATEWAY_MODEL = process.env.EXTRACTION_MODEL ?? "anthropic/claude-sonnet-4-6";

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function hasGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export function hasLLM(): boolean {
  return hasAnthropicKey() || hasGateway();
}

export function llmModel(): LanguageModel {
  if (hasAnthropicKey()) return anthropic(ANTHROPIC_MODEL);
  return GATEWAY_MODEL;
}

export function llmLabel(): string | null {
  if (hasAnthropicKey()) return `anthropic:${ANTHROPIC_MODEL}`;
  if (hasGateway()) return `gateway:${GATEWAY_MODEL}`;
  return null;
}

export function hasASR(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
