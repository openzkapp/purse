export const GWEI_PER_ETH = 1_000_000_000n;
export const WEI_PER_GWEI = 1_000_000_000n;
export const MAX_REQUEST_GWEI = 50_000n;

export function gweiToEth(gwei: bigint | number | string): string {
  const gweiBig = typeof gwei === "bigint" ? gwei : BigInt(Math.floor(Number(gwei)));
  const ethPart = gweiBig / GWEI_PER_ETH;
  const remainder = gweiBig % GWEI_PER_ETH;
  if (remainder === 0n) {
    return ethPart.toString();
  }
  const fraction = remainder.toString().padStart(9, "0").replace(/0+$/, "");
  return `${ethPart}.${fraction}`;
}

export function ethToGwei(eth: number | string): bigint {
  const num = typeof eth === "string" ? parseFloat(eth) : eth;
  if (isNaN(num) || num < 0) return 0n;
  return BigInt(Math.round(num * 1e9));
}

export function formatGwei(gwei: bigint | number | string): string {
  const val = typeof gwei === "bigint" ? Number(gwei) : Number(gwei);
  if (isNaN(val)) return "0 gwei";
  return `${val.toLocaleString()} gwei`;
}

export function formatEth(eth: number | string, maxDecimals = 6): string {
  const num = typeof eth === "string" ? parseFloat(eth) : eth;
  if (isNaN(num)) return "0 ETH";
  return `${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  })} ETH`;
}

export function formatUsd(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function checkChargeCap(estimatedGwei: bigint): {
  readonly allowed: boolean;
  readonly message?: string;
} {
  if (estimatedGwei > MAX_REQUEST_GWEI) {
    return {
      allowed: false,
      message: "This request is larger than the per-request limit. Shorten it and try again.",
    };
  }
  return { allowed: true };
}
