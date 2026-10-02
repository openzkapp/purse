import { build } from "esbuild";
import { buildBrowserSdkAssets } from "@openanonymity/zkapi-browser-sdk/build";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";

// Network selection: explicit env wins; otherwise the last generated network
// (public/zkapi/.network) so a plain `bun run build` cannot silently flip a
// localnet checkout back to mainnet assets.
const stateFile = "public/zkapi/.network";
const persisted = existsSync(stateFile) ? readFileSync(stateFile, "utf8").trim() : null;
const requested =
  process.env.VITE_ZKAPI_NETWORK
  ?? (persisted === "localnet" ? "localnet" : undefined);
const network = requested === "sepolia" ? "sepolia" : "mainnet";

const result = await buildBrowserSdkAssets({
  outDir: "public/zkapi",
  publicPath: "/zkapi/",
  network,
  build,
});

console.log(`[zkapi] ${network} assets verified and written:`);
for (const file of Object.keys(result.files).sort()) {
  console.log(`[zkapi]   ${file}`);
}

if (requested === "localnet" && existsSync("services/localnet/deployment.json")) {
  // Localnet reuses the mainnet ceremony assets (same keys) but needs our
  // self-hosted browser-config; regenerate it after the SDK writes its own.
  await import("../../services/localnet/make-browser-config.mjs");
  writeFileSync(stateFile, "localnet\n");
} else {
  rmSync(stateFile, { force: true });
}
