import { CHAT_SPENDING_TIER_USD } from "@openanonymity/zkapi-browser-sdk/compat";
import type { ModelOption } from "./types";

export const CURATED_MODELS: readonly ModelOption[] = [
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    context: "128k context",
    costClass: "low",
    tierUsd: 2,
    description: "Fast and versatile open-weights intelligence for general queries.",
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    provider: "Anthropic",
    context: "200k context",
    costClass: "medium",
    tierUsd: 2,
    description: "Exceptional reasoning speed and precision for coding and analysis.",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "OpenAI",
    context: "128k context",
    costClass: "low",
    tierUsd: 1,
    description: "Affordable multimodal small model with high benchmark scores.",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    context: "64k context",
    costClass: "high",
    tierUsd: 4.5,
    description: "High-power reasoning engine for logic, math, and code architecture.",
  },
  {
    id: "mistralai/mistral-nemo",
    name: "Mistral Nemo",
    provider: "Mistral",
    context: "128k context",
    costClass: "low",
    tierUsd: 1,
    description: "Efficient multilingual 12B model built with high throughput.",
  },
];

export const DEFAULT_MODEL = CURATED_MODELS[0];

export function isSupportedTier(tierUsd: number): boolean {
  return CHAT_SPENDING_TIER_USD.includes(tierUsd);
}
