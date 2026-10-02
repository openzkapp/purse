import { useState, useCallback, useEffect } from "react";
import { purseClient } from "./client";
import { getErrorCatalogEntry } from "./error-catalog";
import { streamOpenRouterInference } from "./openrouter";
import { DEFAULT_MODEL } from "./models";
import { useModelCatalog } from "./catalog";
import type { BurnReceipt, BurnStatus, ModelOption } from "./types";

const zkApiClient = purseClient();

const RECEIPTS_KEY = "openzk:receipts";

function newSessionId(): string {
  return "openzk_" + crypto.randomUUID();
}

async function settledBurnCost(balanceBefore: bigint, waitMs = 15000): Promise<bigint> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const balance = zkApiClient.getSnapshot().balanceGwei;
    if (balance < balanceBefore) return balanceBefore - balance;
    if (Date.now() >= deadline) return 0n;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

function codeFromError(err: unknown): string {
  if (typeof err === "object" && err !== null && "error_code" in err) {
    const code = (err as { error_code: unknown }).error_code;
    return typeof code === "string" ? code : "network_error";
  }
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === 4001) return "wallet_rejected";
  }
  return "network_error";
}

export function useBurn() {
  const models = useModelCatalog();
  const [status, setStatus] = useState<BurnStatus>("idle");
  const [selectedModel, setSelectedModel] = useState<ModelOption>(DEFAULT_MODEL);
  const [streamingText, setStreamingText] = useState<string>("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<readonly BurnReceipt[]>([]);
  const [currentReceipt, setCurrentReceipt] = useState<BurnReceipt | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECEIPTS_KEY);
      if (stored) {
        setReceipts(JSON.parse(stored));
      }
    } catch {
      // Receipt history is best-effort local state.
    }
  }, []);

  const saveReceipt = (receipt: BurnReceipt) => {
    setReceipts((prev) => {
      const updated = [receipt, ...prev];
      try {
        localStorage.setItem(RECEIPTS_KEY, JSON.stringify(updated));
      } catch {
        // Storage quota
      }
      return updated;
    });
    setCurrentReceipt(receipt);
  };

  const burn = useCallback(
    async (prompt: string, systemPrompt?: string) => {
      if (!prompt.trim()) return;

      const snapshotBefore = zkApiClient.getSnapshot();
      if (snapshotBefore.status === "unfunded") {
        setStatus("failed");
        setErrorMessage("Insufficient balance in your private purse. Please fund your note first.");
        return;
      }

      setErrorCode(null);
      setErrorMessage(null);
      setStreamingText("");
      setCurrentReceipt(null);

      const sessionId = newSessionId();

      try {
        setStatus("proving");
        const access = await zkApiClient.acquireAccess(sessionId, selectedModel.tierUsd, (progress) => {
          if (progress.phase === "ready") return;
          setStatus(progress.phase === "proving" ? "proving" : "leasing");
        });

        setStatus("streaming");
        await streamOpenRouterInference({
          access,
          model: selectedModel.id,
          prompt,
          systemPrompt,
          onToken: (token) => {
            setStreamingText((prev) => prev + token);
          },
        });

        setStatus("settling");
        access.release();
        try {
          await zkApiClient.settleLease();
        } catch {
          // Settlement continues in the background on the next wallet refresh.
        }

        // The receipt that lowers the note balance installs asynchronously
        // after the lease settles; wait briefly for it instead of pricing the
        // burn from a not-yet-updated balance.
        const costGwei = await settledBurnCost(snapshotBefore.balanceGwei);
        const costUsd = costGwei > 0n ? await zkApiClient.formatMoney(costGwei) : "";

        zkApiClient.recordBurn(costGwei, `Inference on ${selectedModel.name}`);

        const receipt: BurnReceipt = {
          requestId: sessionId,
          model: selectedModel.name,
          costUsd: costUsd || "settled onchain",
          costGwei: costGwei.toString(),
          sessionFingerprint: sessionId,
          createdAt: Date.now(),
          responseCode: 200,
        };

        saveReceipt(receipt);
        setStatus("settled");
      } catch (err: unknown) {
      console.error("[zkapi]", err);
        const errCode = codeFromError(err);
        const entry = getErrorCatalogEntry(errCode);
        setErrorCode(errCode);
        setErrorMessage(entry.userMessage);
        setStatus("failed");
      }
    },
    [selectedModel]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setStreamingText("");
    setErrorCode(null);
    setErrorMessage(null);
  }, []);

  return {
    status,
    selectedModel,
    setSelectedModel,
    streamingText,
    errorCode,
    errorMessage,
    receipts,
    currentReceipt,
    burn,
    reset,
    models,
  };
}
