import { ensureDirectCompletionLimit } from "@openanonymity/zkapi-browser-sdk/compat";
import type { InferenceAccess } from "@openanonymity/zkapi-browser-sdk";

export interface StreamOptions {
  readonly access: InferenceAccess;
  readonly model: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly onToken: (token: string) => void;
  readonly signal?: AbortSignal;
}

function errorCodeForStatus(status: number): string {
  if (status === 401 || status === 403) return "invalid_request";
  if (status === 402) return "note_expired";
  if (status === 429) return "oa_rate_limited";
  if (status >= 500) return "capacity_exhausted";
  return "upstream_error";
}

function consumeSseChunk(chunk: string, onToken: (token: string) => void): string {
  let appended = "";
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const dataStr = line.slice(6).trim();
    if (dataStr === "[DONE]") continue;
    try {
      const parsed = JSON.parse(dataStr) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        appended += delta;
        onToken(delta);
      }
    } catch {
      // Partial JSON across chunk boundaries resolves on the next chunk.
    }
  }
  return appended;
}

export async function streamOpenRouterInference({
  access,
  model,
  prompt,
  systemPrompt,
  onToken,
  signal,
}: StreamOptions): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body = ensureDirectCompletionLimit(
    { model, messages, stream: true },
    { spendingLimitUsd: access.spendingLimitUsd }
  );

  const response = await fetch(`${access.baseUrl}/chat/completions`, {
    method: "POST",
    headers: access.headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = new Error(`The model service returned ${response.status}.`) as Error & {
      error_code: string;
    };
    error.error_code = errorCodeForStatus(response.status);
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const error = new Error("No response stream.") as Error & { error_code: string };
    error.error_code = "upstream_error";
    throw error;
  }

  const decoder = new TextDecoder();
  let accumulated = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += consumeSseChunk(decoder.decode(value, { stream: true }), onToken);
  }

  return accumulated;
}
