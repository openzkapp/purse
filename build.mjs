// Bundles the public entries to ESM in dist/. Peer dependencies stay external.
// tsc does not copy input .d.ts files, so the vendored SDK ambient declaration
// is copied manually and referenced from each entry, keeping full type fidelity
// for consumers even without skipLibCheck. If the official SDK ever ships its
// own types, drop this step (duplicate module declarations would clash).
import { build } from "esbuild";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const shared = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  splitting: true,
  outdir: "dist",
  // The SDK is a peer dependency (consumers install the official npm package);
  // react is a peer dependency by contract.
  external: [
    "react",
    "@openanonymity/zkapi-browser-sdk",
    "@openanonymity/zkapi-browser-sdk/*",
  ],
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: ["src/index.ts", "src/react.ts", "src/config.ts"],
});

copyFileSync("src/zkapi-sdk.d.ts", "dist/zkapi-sdk.d.ts");
for (const entry of ["index", "react"]) {
  const path = `dist/${entry}.d.ts`;
  const current = readFileSync(path, "utf8");
  if (!current.includes("zkapi-sdk.d.ts")) {
    writeFileSync(path, `/// <reference path="./zkapi-sdk.d.ts" />\n${current}`);
  }
}
