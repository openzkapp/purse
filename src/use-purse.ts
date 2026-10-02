import { useState, useCallback, useSyncExternalStore, useEffect } from "react";
import { purseClient, type PurseSnapshot, type JournalEntry } from "./client";
import { WEI_PER_GWEI } from "./money";
import { getErrorCatalogEntry } from "./error-catalog";
import type { DepositQuote, DepositStatus } from "./types";

type Phase = DepositStatus;

const zkApiClient = purseClient();

function mapDepositPhase(phase: string): Phase | null {
  const normalized = phase.toLowerCase();
  if (normalized.includes("wallet") || normalized.includes("sign") || normalized.includes("approve")) {
    return "awaiting_wallet_approval";
  }
  if (normalized.includes("confirm") || normalized.includes("receipt") || normalized.includes("mined")) {
    return "awaiting_confirmation";
  }
  if (normalized.includes("journal") || normalized.includes("note") || normalized.includes("record")) {
    return "journaling_note";
  }
  return null;
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

export function usePurse() {
  const [depositStatus, setDepositStatus] = useState<DepositStatus>("idle");
  const [quote, setQuote] = useState<DepositQuote | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const snapshot = useSyncExternalStore<PurseSnapshot>(
    (cb) => zkApiClient.subscribe(cb),
    () => zkApiClient.getSnapshot(),
    () => zkApiClient.getSnapshot()
  );

  const [journal, setJournal] = useState<readonly JournalEntry[]>(() => zkApiClient.getJournal());

  useEffect(() => {
    const unsub = zkApiClient.subscribe(() => {
      setJournal(zkApiClient.getJournal());
    });
    return () => unsub();
  }, []);

  const requestQuote = useCallback(async (usdAmount: number): Promise<DepositQuote | null> => {
    if (usdAmount <= 0) {
      setQuote(null);
      return null;
    }

    setDepositStatus("quoting");
    setErrorCode(null);
    setErrorMessage(null);

    try {
      const sdkQuote = await zkApiClient.requestDepositQuote(usdAmount.toFixed(2));
      const mapped: DepositQuote = {
        usdAmount,
        ethAmount: sdkQuote.ethAmount,
        gweiAmount: BigInt(sdkQuote.depositWei) / WEI_PER_GWEI,
        ethPriceUsd: Number(sdkQuote.price),
        expiresAt: Number(sdkQuote.priceUpdatedAt) * 1000,
        quoteId: `q_${sdkQuote.priceUpdatedAt}`,
      };
      setQuote(mapped);
      setDepositStatus("idle");
      return mapped;
    } catch (err: unknown) {
      console.error("[zkapi]", err);
      const entry = getErrorCatalogEntry(codeFromError(err));
      setErrorCode(entry.code === "unknown" ? "network_error" : entry.code);
      setErrorMessage(entry.userMessage);
      setDepositStatus("failed");
      return null;
    }
  }, []);

  const startDeposit = useCallback(
    async (currentQuote: DepositQuote, _walletProvider?: unknown, userAddress?: string) => {
      if (!userAddress) {
        setDepositStatus("failed");
        setErrorMessage("Connect your wallet to fund your private balance.");
        return;
      }

      setDepositStatus("awaiting_wallet_approval");
      setErrorCode(null);
      setErrorMessage(null);

      try {
        await zkApiClient.startDeposit(currentQuote.ethAmount, userAddress, (phase) => {
          const mapped = mapDepositPhase(phase);
          if (mapped) setDepositStatus(mapped);
        });
        setDepositStatus("ready");
      } catch (err: unknown) {
      console.error("[zkapi]", err);
        const errCode = codeFromError(err);
        const entry = getErrorCatalogEntry(errCode);
        setErrorCode(errCode);
        setErrorMessage(entry.userMessage);
        setDepositStatus("failed");
      }
    },
    []
  );

  const reset = useCallback(() => {
    setDepositStatus("idle");
    setQuote(null);
    setErrorCode(null);
    setErrorMessage(null);
  }, []);

  return {
    snapshot,
    journal,
    quote,
    depositStatus,
    errorCode,
    errorMessage,
    requestQuote,
    startDeposit,
    reset,
  };
}
