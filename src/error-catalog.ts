export type Severity = "info" | "warn" | "error";

export type CatalogAction =
  | "resync_retry"
  | "fresh_retry"
  | "backoff"
  | "halt"
  | "route_exit";

export interface CatalogEntry {
  readonly code: string;
  readonly userMessage: string;
  readonly action: CatalogAction;
  readonly severity: Severity;
}

export const ERROR_CATALOG: Record<string, CatalogEntry> = {
  stale_root: {
    code: "stale_root",
    userMessage: "Your balance check is out of date. Refreshing now.",
    action: "resync_retry",
    severity: "warn",
  },
  replay: {
    code: "replay",
    userMessage: "That request was already counted. Sending a new one.",
    action: "fresh_retry",
    severity: "warn",
  },
  native_quote_expired: {
    code: "native_quote_expired",
    userMessage: "The price changed. Getting a fresh one.",
    action: "fresh_retry",
    severity: "info",
  },
  native_quote_superseded: {
    code: "native_quote_superseded",
    userMessage: "The price changed. Getting a fresh one.",
    action: "fresh_retry",
    severity: "info",
  },
  nullifier_used: {
    code: "nullifier_used",
    userMessage: "This balance was already spent somewhere else.",
    action: "halt",
    severity: "error",
  },
  lease_pending: {
    code: "lease_pending",
    userMessage: "Finishing up the last request. One moment.",
    action: "backoff",
    severity: "info",
  },
  note_expired: {
    code: "note_expired",
    userMessage: "This balance expired. Withdraw any remaining funds.",
    action: "route_exit",
    severity: "warn",
  },
  invalid_proof: {
    code: "invalid_proof",
    userMessage: "Something went wrong verifying your balance. Nothing was charged.",
    action: "halt",
    severity: "error",
  },
  protocol_mismatch: {
    code: "protocol_mismatch",
    userMessage: "This app needs a refresh. Reload the page.",
    action: "halt",
    severity: "error",
  },
  invalid_request: {
    code: "invalid_request",
    userMessage: "That request could not be sent. Try again.",
    action: "halt",
    severity: "error",
  },
  oa_minute_request_limit: {
    code: "oa_minute_request_limit",
    userMessage: "The service is busy. Trying again in a moment.",
    action: "backoff",
    severity: "warn",
  },
  oa_hourly_issuance_budget: {
    code: "oa_hourly_issuance_budget",
    userMessage: "The service is busy right now. Please try again later.",
    action: "backoff",
    severity: "warn",
  },
  oa_rate_limited: {
    code: "oa_rate_limited",
    userMessage: "The service is busy. Trying again in a moment.",
    action: "backoff",
    severity: "warn",
  },
  capacity_exhausted: {
    code: "capacity_exhausted",
    userMessage: "Temporarily unavailable. Please try again shortly.",
    action: "backoff",
    severity: "warn",
  },
  network_error: {
    code: "network_error",
    userMessage: "Connection lost. Check your internet and try again.",
    action: "halt",
    severity: "warn",
  },
  upstream_error: {
    code: "upstream_error",
    userMessage: "The model service reported a problem. You only pay for what was used.",
    action: "halt",
    severity: "error",
  },
  wallet_rejected: {
    code: "wallet_rejected",
    userMessage: "The wallet request was declined. Nothing was sent.",
    action: "halt",
    severity: "warn",
  },
};

const DEFAULT_ERROR: CatalogEntry = {
  code: "unknown",
  userMessage: "Temporarily unavailable, please try again later.",
  action: "halt",
  severity: "error",
};

export function getErrorCatalogEntry(code?: string | null): CatalogEntry {
  if (!code) {
    return DEFAULT_ERROR;
  }
  return ERROR_CATALOG[code] ?? DEFAULT_ERROR;
}
