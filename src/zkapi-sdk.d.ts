declare module "@openanonymity/zkapi-browser-sdk" {
  export interface ZkapiNoteStatus {
    readonly note_id: number;
    readonly deposit_amount: number | string;
    readonly current_balance: number | string;
    readonly expiry_ts: number;
    readonly is_genesis: boolean;
    readonly current_anchor: string;
    readonly current_commitment_x: string;
    readonly current_commitment_y: string;
  }

  export interface ZkapiWalletStatus {
    readonly has_note: boolean;
    readonly pending_request: boolean;
    readonly note: ZkapiNoteStatus | null;
  }

  export interface ZkapiDepositRecord {
    readonly status?: string;
    readonly noteId?: number;
    readonly amount?: number;
    readonly createdAt?: number;
    readonly confirmedAt?: number;
    readonly transactionHash?: string;
    readonly expiryClaim?: number;
    readonly receiptBlockNumber?: number;
  }

  export interface ZkapiWithdrawalRecord {
    readonly status?: string;
    readonly mode?: string;
    readonly finalBalance?: number;
    readonly createdAt?: number;
    readonly closedAt?: number;
    readonly transactionHash?: string;
  }

  export interface ZkapiSnapshot {
    readonly wallet: ZkapiWalletStatus | null;
    readonly walletAddress?: string | null;
    readonly deposits: readonly ZkapiDepositRecord[];
    readonly withdrawals: readonly ZkapiWithdrawalRecord[];
    readonly loading?: boolean;
    readonly initialized?: boolean;
    readonly lastError?: { code?: string | null; message?: string | null } | null;
  }

  export interface UsdDepositQuote {
    readonly amount: string;
    readonly ethAmount: string;
    readonly depositWei: string;
    readonly usdAmount: string;
    readonly priceUpdatedAt: number;
    readonly price: string;
    readonly chainId: number;
    readonly contractAddress: string;
  }

  export interface PreparedDeposit {
    readonly operationId: string;
    readonly commitment: string;
    readonly amount: string;
    readonly depositWei: string;
    readonly chainId: number;
    readonly contractAddress: string;
    readonly transaction: {
      readonly from: string;
      readonly to: string;
      readonly data: string;
      readonly value: string;
    };
  }

  export interface AccessProgress {
    readonly kind: string;
    readonly phase: string;
    readonly message: string;
    readonly sessionId?: string;
    readonly failedPhase?: string;
  }

  export interface InferenceAccess {
    readonly mode: "ephemeral-key";
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly spendingLimitUsd: number;
    readonly headers: Record<string, string>;
    readonly release: () => void;
  }

  export type ZkapiStatusCallback = (status: string) => void;

  export interface ZkapiClient {
    init(): Promise<void>;
    subscribe(listener: (snapshot: ZkapiSnapshot) => void): () => void;
    snapshot(): ZkapiSnapshot;
    setWalletProvider(provider: unknown): void;
    quoteDepositUsd(usd: string, options?: { signal?: AbortSignal }): Promise<UsdDepositQuote>;
    prepareDepositQuote(amount: string, options: { from: string }): Promise<PreparedDeposit>;
    deposit(
      amount: string,
      onStatus?: ZkapiStatusCallback,
      options?: { preparedOperationId?: string | null }
    ): Promise<unknown>;
    withdraw(
      mode: "mutual" | "escape",
      onStatus?: ZkapiStatusCallback,
      options?: { destination?: string }
    ): Promise<unknown>;
    acquireInferenceAccess(
      sessionId: string,
      options?: {
        signal?: AbortSignal;
        spendingLimitUsd?: number;
        onProgress?: (progress: AccessProgress) => void;
      }
    ): Promise<InferenceAccess>;
    settleActiveLease(
      onStatus?: ZkapiStatusCallback,
      options?: { sessionId?: string | null }
    ): Promise<unknown>;
    formatMoney(units: number | string): string;
    formatBillingAmount(units: number | string): string;
    ensureTestnetAccess(options?: { interactive?: boolean; signal?: AbortSignal }): Promise<unknown>;
    refreshEthUsdPrice(options?: { signal?: AbortSignal }): Promise<unknown>;
  }

  export interface ConfigureOptions {
    readonly configUrl?: string | null;
    readonly workerUrl?: string | null;
    readonly mode?: "browser";
    readonly transport?:
      | ((url: string, init: RequestInit, hints: { preferProxy?: boolean }) => Promise<Response> | Response)
      | null;
    readonly requestTestnetPassword?:
      | ((context: {
          authenticate: (value: string, options?: { signal?: AbortSignal }) => Promise<void>;
          signal: AbortSignal | null;
        }) => Promise<void>)
      | null;
  }

  export function configureBrowserSdk(options: ConfigureOptions): ConfigureOptions;
  export const zkapiClient: ZkapiClient;
}

declare module "@openanonymity/zkapi-browser-sdk/compat" {
  export const CHAT_SPENDING_TIER_USD: readonly number[];
  export function ensureDirectCompletionLimit(
    body: Record<string, unknown>,
    options?: {
      spendingLimitUsd?: number;
      model?: {
        pricing?: { completion?: string };
        top_provider?: { max_completion_tokens?: number };
      };
    }
  ): Record<string, unknown>;
}

declare module "@openanonymity/zkapi-browser-sdk/build" {
  import type { BuildOptions } from "esbuild";

  export interface BuiltSdkAssets {
    readonly directory: string;
    readonly config: unknown;
    readonly manifest: unknown;
    readonly files: Record<string, string>;
    readonly configUrl: string;
    readonly workerUrl: string;
  }

  export function buildBrowserSdkAssets(options: {
    outDir: string;
    network?: "sepolia" | "mainnet";
    publicPath?: string;
    build: (options: BuildOptions) => Promise<unknown>;
  }): Promise<BuiltSdkAssets>;
}
