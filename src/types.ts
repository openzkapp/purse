export type DepositStatus =
  | "idle"
  | "quoting"
  | "awaiting_wallet_approval"
  | "awaiting_confirmation"
  | "journaling_note"
  | "ready"
  | "failed";

export interface DepositQuote {
  readonly usdAmount: number;
  readonly ethAmount: string;
  readonly gweiAmount: bigint;
  readonly ethPriceUsd: number;
  readonly expiresAt: number;
  readonly quoteId: string;
}
export type WithdrawStatus =
  | "idle"
  | "proving"
  | "requesting_clearance"
  | "awaiting_wallet_approval"
  | "broadcasting"
  | "withdrawn"
  | "failed";

export interface WithdrawalDetails {
  readonly recipientAddress: string;
  readonly amountGwei: bigint;
  readonly clearanceSignature?: string;
  readonly txHash?: string;
  readonly completedAt?: number;
}
export type BurnStatus =
  | "idle"
  | "proving"
  | "leasing"
  | "streaming"
  | "settling"
  | "settled"
  | "recovering"
  | "failed";

export interface ModelOption {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly context: string;
  readonly costClass: "low" | "medium" | "high";
  readonly tierUsd: number;
  readonly description: string;
}

export interface BurnReceipt {
  readonly requestId: string;
  readonly model: string;
  readonly costUsd: string;
  readonly costGwei: string;
  readonly sessionFingerprint: string;
  readonly createdAt: number;
  readonly responseCode: number;
}
