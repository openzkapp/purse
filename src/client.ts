import { getActiveDeployment, type DeploymentInfo } from "./config";
import type {
  AccessProgress,
  InferenceAccess,
  UsdDepositQuote,
  ZkapiClient,
  ZkapiDepositRecord,
  ZkapiSnapshot,
  ZkapiStatusCallback,
  ZkapiWithdrawalRecord,
} from "@openanonymity/zkapi-browser-sdk";

export interface PurseSnapshot {
  readonly balanceGwei: bigint;
  readonly anchorTimestamp: number;
  readonly expiresAt: number | null;
  readonly status: "synced" | "syncing" | "stale" | "unfunded";
  readonly latestRoot: string;
  readonly noteFingerprint: string | null;
}

export interface HealthCheckResult {
  readonly status: "ok" | "connecting" | "error";
  readonly root: string | null;
  readonly mode: string;
  readonly serverUrl: string;
  readonly checkedAt: number;
}

export interface JournalEntry {
  readonly id: string;
  readonly type: "deposit" | "burn" | "withdrawal";
  readonly amountGwei: bigint;
  readonly amountUsd?: string;
  readonly timestamp: number;
  readonly txHash?: string;
  readonly status: "pending" | "confirmed" | "failed";
  readonly details?: string;
}

interface BurnJournalRecord {
  readonly id: string;
  readonly amountGwei: string;
  readonly details: string;
  readonly timestamp: number;
}

type Listener = () => void;

const BURN_JOURNAL_KEY = "openzk:burns";
const BURN_JOURNAL_LIMIT = 100;
const HEALTH_TIMEOUT_MS = 6000;

function toBigInt(value: number | string | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  try {
    return BigInt(String(value));
  } catch {
    return 0n;
  }
}

async function requestTestnetPassword({
  authenticate,
  signal,
}: {
  authenticate: (value: string, options?: { signal?: AbortSignal }) => Promise<void>;
  signal: AbortSignal | null;
}): Promise<void> {
  // Dev preset for self-hosted testnets; falls through to the prompt if rejected.
  const preset = import.meta.env?.VITE_ZKAPI_TESTNET_PASSWORD as string | undefined;
  if (preset) {
    try {
      await authenticate(preset, signal ? { signal } : undefined);
      return;
    } catch {
      // fall through to the interactive prompt
    }
  }
  for (;;) {
    const value = window.prompt("This test service needs its shared password.");
    if (value === null) throw new Error("The service password was not provided.");
    try {
      await authenticate(value, signal ? { signal } : undefined);
      return;
    } catch {
      // Rejected password keeps the prompt open per the SDK contract.
    }
  }
}

class ZkApiClient {
  private readonly deployment: DeploymentInfo;
  private readonly listeners = new Set<Listener>();
  private readonly healthListeners = new Set<Listener>();

  private snapshot: PurseSnapshot = {
    balanceGwei: 0n,
    anchorTimestamp: Date.now(),
    expiresAt: null,
    status: "unfunded",
    latestRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
    noteFingerprint: null,
  };

  private health: HealthCheckResult = {
    status: "connecting",
    root: null,
    mode: "live",
    serverUrl: "",
    checkedAt: Date.now(),
  };

  private journal: JournalEntry[] = [];
  private burns: BurnJournalRecord[] = [];
  private walletProvider: unknown = null;
  private sdkPromise: Promise<ZkapiClient> | null = null;

  constructor(deployment: DeploymentInfo) {
    this.deployment = deployment;
    this.health = { ...this.health, serverUrl: this.deployment.serverUrl };
    if (typeof window !== "undefined") {
      this.loadBurns();
    }
  }

  private loadBurns(): void {
    try {
      const stored = localStorage.getItem(BURN_JOURNAL_KEY);
      if (stored) this.burns = JSON.parse(stored);
    } catch {
      this.burns = [];
    }
  }

  private persistBurns(): void {
    try {
      localStorage.setItem(BURN_JOURNAL_KEY, JSON.stringify(this.burns));
    } catch {
      // Storage quota exhaustion only affects local history.
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeHealth(listener: Listener): () => void {
    this.healthListeners.add(listener);
    return () => this.healthListeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private notifyHealth(): void {
    for (const listener of this.healthListeners) {
      listener();
    }
  }

  public getSnapshot(): PurseSnapshot {
    return this.snapshot;
  }

  public getHealth(): HealthCheckResult {
    return this.health;
  }

  public getJournal(): readonly JournalEntry[] {
    return this.journal;
  }

  public setWalletProvider(provider: unknown): void {
    this.walletProvider = provider;
    if (this.sdkPromise === null || this.walletProvider === null) return;
    void this.applyWalletProvider();
  }

  private async applyWalletProvider(): Promise<void> {
    try {
      const sdk = await this.ensureReady();
      sdk.setWalletProvider(this.walletProvider);
    } catch {
      // Provider is applied at bootstrap when the SDK is not ready yet.
    }
  }

  public async ensureReady(): Promise<ZkapiClient> {
    if (typeof window === "undefined") {
      throw new TypeError("The private wallet is only available in the browser.");
    }
    if (!this.sdkPromise) this.sdkPromise = this.bootstrap();
    return this.sdkPromise;
  }

  private async bootstrap(): Promise<ZkapiClient> {
    const sdkModule = await import("@openanonymity/zkapi-browser-sdk");
    sdkModule.configureBrowserSdk({
      configUrl: "/zkapi/browser-config.json",
      workerUrl: "/zkapi/assets/zkapiWasmWorker.js",
      requestTestnetPassword: this.deployment.testnetPasswordRequired
        ? requestTestnetPassword
        : null,
    });
    if (this.walletProvider) sdkModule.zkapiClient.setWalletProvider(this.walletProvider);
    const sdk = sdkModule.zkapiClient;
    await sdk.init();
    sdk.subscribe((snap) => this.ingest(snap));
    this.ingest(sdk.snapshot());
    return sdk;
  }

  private ingest(snap: ZkapiSnapshot): void {
    const note = snap.wallet?.note ?? null;
    const initialized = snap.initialized !== false;
    let status: PurseSnapshot["status"];
    if (!initialized) {
      status = "syncing";
    } else if (note) {
      status = "synced";
    } else {
      status = "unfunded";
    }
    this.snapshot = {
      balanceGwei: toBigInt(note?.current_balance),
      anchorTimestamp: Date.now(),
      expiresAt: note ? Number(note.expiry_ts) * 1000 : null,
      status,
      latestRoot: note?.current_anchor ?? this.snapshot.latestRoot,
      noteFingerprint: note?.current_commitment_x ?? null,
    };
    this.journal = this.mergeJournal(snap);
    this.notify();
  }

  private mapDeposit(record: ZkapiDepositRecord, index: number): JournalEntry {
    const note = this.snapshot.noteFingerprint;
    return {
      id: `dep_${record.transactionHash ?? record.noteId ?? index}`,
      type: "deposit",
      amountGwei: toBigInt(record.amount),
      timestamp: Number(record.confirmedAt ?? record.createdAt ?? 0) || Date.now(),
      txHash: record.transactionHash,
      status: record.status === "confirmed" ? "confirmed" : "pending",
      details: note ? undefined : "Deposit confirmed onchain",
    };
  }

  private mapWithdrawal(record: ZkapiWithdrawalRecord, index: number): JournalEntry {
    return {
      id: `wth_${record.transactionHash ?? index}`,
      type: "withdrawal",
      amountGwei: toBigInt(record.finalBalance),
      timestamp: Number(record.closedAt ?? record.createdAt ?? 0) || Date.now(),
      txHash: record.transactionHash,
      status: record.status === "confirmed" ? "confirmed" : "pending",
    };
  }

  private mergeJournal(snap: ZkapiSnapshot): JournalEntry[] {
    const burns: JournalEntry[] = this.burns.map((record) => ({
      id: record.id,
      type: "burn" as const,
      amountGwei: toBigInt(record.amountGwei),
      timestamp: record.timestamp,
      status: "confirmed" as const,
      details: record.details,
    }));
    const deposits = snap.deposits.map((record, index) => this.mapDeposit(record, index));
    const withdrawals = snap.withdrawals.map((record, index) =>
      this.mapWithdrawal(record, index)
    );
    return [...burns, ...deposits, ...withdrawals].sort((a, b) => b.timestamp - a.timestamp);
  }

  public async init(): Promise<void> {
    await this.checkHealth();
    if (typeof window !== "undefined") {
      try {
        await this.ensureReady();
      } catch {
        // SDK readiness is reflected through health and snapshot state.
      }
    }
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    this.health = {
      status: "connecting",
      root: null,
      mode: "live",
      serverUrl: this.deployment.serverUrl,
      checkedAt: Date.now(),
    };
    this.notifyHealth();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const resp = await fetch(`${this.deployment.serverUrl}/health`, {
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);

      if (!resp?.ok) throw new Error("health check failed");

      const data = (await resp.json().catch(() => ({}))) as {
        current_root?: string;
        request_modes?: string[];
      };
      this.health = {
        status: "ok",
        root: data.current_root ?? null,
        mode: Array.isArray(data.request_modes) ? data.request_modes[0] : "live",
        serverUrl: this.deployment.serverUrl,
        checkedAt: Date.now(),
      };
    } catch {
      this.health = {
        status: "error",
        root: null,
        mode: "live",
        serverUrl: this.deployment.serverUrl,
        checkedAt: Date.now(),
      };
    }
    this.notifyHealth();
    return this.health;
  }

  public async requestDepositQuote(usdAmount: string): Promise<UsdDepositQuote> {
    const sdk = await this.ensureReady();
    await sdk.ensureTestnetAccess({ interactive: true });
    return sdk.quoteDepositUsd(usdAmount);
  }

  public async startDeposit(
    ethAmount: string,
    from: string,
    onStatus: ZkapiStatusCallback
  ): Promise<void> {
    const sdk = await this.ensureReady();
    await sdk.ensureTestnetAccess({ interactive: true });
    const prepared = await sdk.prepareDepositQuote(ethAmount, { from });
    onStatus("prepared");
    await sdk.deposit(ethAmount, onStatus, { preparedOperationId: prepared.operationId });
  }

  public async acquireAccess(
    sessionId: string,
    spendingLimitUsd: number,
    onProgress: (progress: AccessProgress) => void
  ): Promise<InferenceAccess> {
    const sdk = await this.ensureReady();
    await sdk.ensureTestnetAccess({ interactive: true });
    return sdk.acquireInferenceAccess(sessionId, { spendingLimitUsd, onProgress });
  }

  public async settleLease(onStatus?: ZkapiStatusCallback): Promise<void> {
    const sdk = await this.ensureReady();
    await sdk.ensureTestnetAccess({ interactive: true });
    await sdk.settleActiveLease(onStatus ?? (() => {}));
  }

  public async formatMoney(gwei: bigint): Promise<string> {
    const sdk = await this.ensureReady();
    return sdk.formatMoney(gwei.toString());
  }

  public async withdrawMutual(
    destination: string | undefined,
    onStatus: ZkapiStatusCallback
  ): Promise<void> {
    const sdk = await this.ensureReady();
    await sdk.ensureTestnetAccess({ interactive: true });
    await sdk.withdraw("mutual", onStatus, destination ? { destination } : {});
  }

  public recordBurn(amountGwei: bigint, details?: string): void {
    if (amountGwei <= 0n) return;
    const record: BurnJournalRecord = {
      id: "brn_" + Date.now().toString(36),
      amountGwei: amountGwei.toString(),
      details: details ?? "",
      timestamp: Date.now(),
    };
    this.burns = [record, ...this.burns].slice(0, BURN_JOURNAL_LIMIT);
    this.persistBurns();
    this.journal = this.mergeJournal({
      wallet: null,
      deposits: [],
      withdrawals: [],
    });
    this.notify();
  }
}

let activeClient: ZkApiClient | null = null;

export function purseClient(): ZkApiClient {
  if (!activeClient) activeClient = new ZkApiClient(getActiveDeployment());
  return activeClient;
}

export function configurePurse(deployment: DeploymentInfo): ZkApiClient {
  activeClient = new ZkApiClient(deployment);
  return activeClient;
}
