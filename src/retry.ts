import { getErrorCatalogEntry } from "./error-catalog";

export interface RetryResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly errorCode?: string;
  readonly userMessage?: string;
}

export async function executeWithSingleRetry<T>(
  action: () => Promise<T>,
  onRetry?: () => Promise<void> | void
): Promise<RetryResult<T>> {
  try {
    const value = await action();
    return { ok: true, value };
  } catch (err: unknown) {
    const errorCode = typeof err === "object" && err !== null && "error_code" in err
      ? String((err as { error_code: unknown }).error_code)
      : "network_error";

    const entry = getErrorCatalogEntry(errorCode);

    if (entry.action === "resync_retry" || entry.action === "fresh_retry") {
      try {
        if (onRetry) {
          await onRetry();
        }
        const retryValue = await action();
        return { ok: true, value: retryValue };
      } catch (retryErr: unknown) {
        const secondCode = typeof retryErr === "object" && retryErr !== null && "error_code" in retryErr
          ? String((retryErr as { error_code: unknown }).error_code)
          : errorCode;
        const secondEntry = getErrorCatalogEntry(secondCode);
        return {
          ok: false,
          errorCode: secondCode,
          userMessage: secondEntry.userMessage,
        };
      }
    }

    return {
      ok: false,
      errorCode,
      userMessage: entry.userMessage,
    };
  }
}
