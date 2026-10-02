export type NetworkId = "mainnet" | "sepolia" | "localnet";

import localnetDeployment from "./localnet.json";

export interface DeploymentInfo {
  readonly network: NetworkId;
  readonly serverUrl: string;
  readonly chainId: number;
  readonly vaultAddress: string;
  readonly testnetPasswordRequired: boolean;
}

export const DEPLOYMENTS: Record<NetworkId, DeploymentInfo> = {
  sepolia: {
    network: "sepolia",
    serverUrl: "https://zkapi-sepolia.openanonymity.ai",
    chainId: 11155111,
    vaultAddress: "0x49fa19f9bdece7a48ebc7749fd69ad40f577590f",
    testnetPasswordRequired: true,
  },
  mainnet: {
    network: "mainnet",
    serverUrl: "https://zkapi-mainnet.openanonymity.ai",
    chainId: 1,
    vaultAddress: "0x4386fdbda35d995beb3bf8625118ec5982ec81fe",
    testnetPasswordRequired: false,
  },
  localnet: {
    network: "localnet",
    // Prod self-host builds pass the public origin; local dev keeps localhost.
    serverUrl: import.meta.env.VITE_ZKAPI_SERVER_URL ?? "http://127.0.0.1:3000",
    chainId: 11155111,
    vaultAddress: localnetDeployment.vaultAddress,
    testnetPasswordRequired: false,
  },
};

export const PROTOCOL_CONSTANTS = {
  chargeCapGwei: 50_000n,
  leaseTtlSeconds: 300,
  nativeAssetWeiPerUnit: 1_000_000_000n,
  openrouterBaseUrl: "https://openrouter.ai/api/v1",
  sdkRevision: "b826c169b4831665822529f535f824265f50630b",
} as const;

export function getActiveNetwork(): NetworkId {
  const envNetwork = typeof process !== "undefined"
    ? process.env?.VITE_ZKAPI_NETWORK
    : undefined;

  const importMetaEnv = typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env.VITE_ZKAPI_NETWORK as string | undefined)
    : undefined;

  const chosen = (importMetaEnv || envNetwork || "mainnet").toLowerCase();
  if (chosen === "sepolia") return "sepolia";
  if (chosen === "localnet") return "localnet";
  return "mainnet";
}

export function getActiveDeployment(): DeploymentInfo {
  return DEPLOYMENTS[getActiveNetwork()];
}
