import { useEffect, useState } from "react";
import { CHAT_SPENDING_TIER_USD } from "@openanonymity/zkapi-browser-sdk/compat";
import { CURATED_MODELS } from "./models";
import type { ModelOption } from "./types";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CATALOG_CACHE_KEY = "openzk:catalog";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const ESTIMATED_PROMPT_TOKENS = 4096;
const ESTIMATED_COMPLETION_TOKENS = 2048;
const MIN_CONTEXT_TOKENS = 16000;
const MAX_LIVE_MODELS = 40;

interface OpenRouterModel {
  readonly id: string;
  readonly name?: string;
  readonly context_length?: number;
  readonly pricing?: { readonly prompt?: string; readonly completion?: string };
}

interface CatalogCache {
  readonly fetchedAt: number;
  readonly models: readonly ModelOption[];
}

export function tierForEstimatedCost(estimatedUsd: number): number | null {
  const ascending = [...CHAT_SPENDING_TIER_USD].sort((a, b) => a - b);
  for (const tier of ascending) {
    if (estimatedUsd <= tier) return tier;
  }
  return null;
}

export function estimateSessionCostUsd(promptPerToken: number, completionPerToken: number): number {
  return ESTIMATED_PROMPT_TOKENS * promptPerToken + ESTIMATED_COMPLETION_TOKENS * completionPerToken;
}

function costClassForTier(tierUsd: number): ModelOption["costClass"] {
  if (tierUsd <= 1) return "low";
  if (tierUsd <= 3) return "medium";
  return "high";
}

function formatContext(contextLength: number): string {
  return `${Math.max(1, Math.round(contextLength / 1024))}k context`;
}

function providerFromId(id: string): string {
  const prefix = id.split("/")[0] || id;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export function mapOpenRouterModel(model: OpenRouterModel): ModelOption | null {
  const promptPerToken = Number(model.pricing?.prompt);
  const completionPerToken = Number(model.pricing?.completion);
  const contextLength = model.context_length ?? 0;
  if (!model.id || !Number.isFinite(promptPerToken) || !Number.isFinite(completionPerToken)) {
    return null;
  }
  if (promptPerToken < 0 || completionPerToken < 0 || contextLength < MIN_CONTEXT_TOKENS) {
    return null;
  }
  const tierUsd = tierForEstimatedCost(
    estimateSessionCostUsd(promptPerToken, completionPerToken)
  );
  if (tierUsd === null) return null;
  return {
    id: model.id,
    name: model.name?.trim() || model.id.split("/")[1] || model.id,
    provider: providerFromId(model.id),
    context: formatContext(contextLength),
    costClass: costClassForTier(tierUsd),
    tierUsd,
    description: "Priced per token, added from the live catalog.",
  };
}

export function mergeCatalog(
  curated: readonly ModelOption[],
  live: readonly ModelOption[]
): ModelOption[] {
  const curatedIds = new Set(curated.map((model) => model.id));
  // ponytail: alphabetical cap, no popularity signal on the public endpoint
  return [
    ...curated,
    ...live
      .filter((model) => !curatedIds.has(model.id))
      .sort((a, b) => a.tierUsd - b.tierUsd || a.name.localeCompare(b.name))
      .slice(0, MAX_LIVE_MODELS),
  ];
}

function readCache(): readonly ModelOption[] | null {
  try {
    const stored = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!stored) return null;
    const cache = JSON.parse(stored) as CatalogCache;
    if (!Array.isArray(cache.models) || Date.now() - cache.fetchedAt > CATALOG_TTL_MS) {
      return null;
    }
    return cache.models;
  } catch {
    return null;
  }
}

function writeCache(models: readonly ModelOption[]): void {
  try {
    localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), models } satisfies CatalogCache)
    );
  } catch {
    // Catalog cache is best-effort; curated models remain the base.
  }
}

async function fetchLiveModels(): Promise<readonly ModelOption[] | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(CATALOG_URL, { signal: controller.signal });
    if (!resp?.ok) return null;
    const payload = (await resp.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) return null;
    return payload.data
      .map((entry) => mapOpenRouterModel(entry as OpenRouterModel))
      .filter((entry): entry is ModelOption => entry !== null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useModelCatalog(): readonly ModelOption[] {
  const [models, setModels] = useState<readonly ModelOption[]>(CURATED_MODELS);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache();
    if (cached) {
      setModels(mergeCatalog(CURATED_MODELS, cached));
      return;
    }
    void fetchLiveModels().then((live) => {
      if (cancelled || live === null) return;
      writeCache(live);
      setModels(mergeCatalog(CURATED_MODELS, live));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return models;
}
