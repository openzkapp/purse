import { useState, useCallback } from "react";
import { purseClient } from "./client";
import { getErrorCatalogEntry } from "./error-catalog";
import type { WithdrawStatus, WithdrawalDetails } from "./types";

const zkApiClient = purseClient();

function mapWithdrawPhase(phase: string): WithdrawStatus | null {
  const normalized = phase.toLowerCase();
  if (normalized.includes("clearance")) {
    return "requesting_clearance";
  }
  if (normalized.includes("wallet") || normalized.includes("sign") || normalized.includes("approve")) {
    return "awaiting_wallet_approval";
  }
  if (normalized.includes("broadcast") || normalized.includes("receipt") || normalized.includes("mined")) {
    return "broadcasting";
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

export function useExit() {
  const [status, setStatus] = useState<WithdrawStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [withdrawalDetails, setWithdrawalDetails] = useState<WithdrawalDetails | null>(null);

  const withdraw = useCallback(async (recipientAddress: string, _walletProvider?: unknown, _userAddress?: string) => {
    const snapshot = zkApiClient.getSnapshot();
    if (snapshot.status === "unfunded") {
      setStatus("failed");
      setErrorMessage("No funds available to withdraw.");
      return;
    }

    const cleanAddress = recipientAddress.trim();
    if (cleanAddress && !/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
      setStatus("failed");
      setErrorMessage("Please enter a valid Ethereum address (0x...).");
      return;
    }

    setErrorCode(null);
    setErrorMessage(null);
    setStatus("proving");

    try {
      await zkApiClient.withdrawMutual(cleanAddress || undefined, (phase) => {
        const mapped = mapWithdrawPhase(phase);
        if (mapped) setStatus(mapped);
      });

      const details: WithdrawalDetails = {
        recipientAddress: cleanAddress,
        amountGwei: snapshot.balanceGwei,
        completedAt: Date.now(),
      };

      setWithdrawalDetails(details);
      setStatus("withdrawn");
    } catch (err: unknown) {
      console.error("[zkapi]", err);
      const errCode = codeFromError(err);
      const entry = getErrorCatalogEntry(errCode);
      setErrorCode(errCode);
      setErrorMessage(entry.userMessage);
      setStatus("failed");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setErrorCode(null);
    setErrorMessage(null);
    setWithdrawalDetails(null);
  }, []);

  return {
    status,
    errorCode,
    errorMessage,
    withdrawalDetails,
    withdraw,
    reset,
  };
}
