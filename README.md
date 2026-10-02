<p align="center">
  <img src="https://openzk.app/images/openzk/openzk3x1.png" width="320" alt="OpenZK">
</p>

# @openzk.app/purse

React toolkit for the zkAPI protocol. A user funds a private ETH note, each metered AI call burns a slice of it behind a zero-knowledge proof, and nothing about the user ever reaches your server. No cards, no accounts, no email. This is the billing layer we run in production on [openzk.app](https://openzk.app).

The crypto is the zkAPI protocol (Groth16 over BN254, Poseidon, Baby-JubJub). Note secrets and nullifier secrets are made in the browser and stay there. Your backend is never in the loop.

## Install

```bash
npm install @openzk.app/purse react
```

Peer deps are `react ^19` and `@openanonymity/zkapi-browser-sdk ^0.2.0`. The SDK peer is optional in the manifest because it is not on the public registry: it reaches you through zkAPI operator access, and you add it to your project yourself (a `file:` or `link:` entry, or an alias). Install exactly one copy of the SDK. It keeps a singleton internally and two copies will fight over it.

Browsers only. There is no Node or server-side mode; the proving worker needs a real browser.

## Before it will boot

Three things, in order:

**1. SDK assets under /zkapi/.** The SDK ships a WASM proving worker plus proving keys and a browser config, and the client expects all of it same-origin at `/zkapi/...`. Generate at build time:

```js
import { buildBrowserSdkAssets } from "@openanonymity/zkapi-browser-sdk/build";

await buildBrowserSdkAssets({
  outDir: "public/zkapi",
  publicPath: "/zkapi/",
  network: "mainnet",
});
```

The client boots from `/zkapi/browser-config.json`. If that 404s, nothing else runs, so check this first.

**2. Pick a network.** Read at build time from `VITE_ZKAPI_NETWORK` (`mainnet`, `sepolia`, `localnet`). If your stack has no Vite-style env, call `configurePurse(deployment)` before anything else instead.

**3. Hand it a wallet.** The purse never touches `window.ethereum` on its own. Whatever wallet layer you use, push the EIP-1193 provider in:

```ts
purseClient().setWalletProvider(provider);
```

## The short version

```tsx
import { useEffect, useState } from "react";
import { purseClient } from "@openzk.app/purse";
import { usePurse, useBurn, useExit } from "@openzk.app/purse/react";

function Billing() {
  const [address, setAddress] = useState("");
  const { snapshot, requestQuote, startDeposit, depositStatus } = usePurse();
  const { burn, streamingText } = useBurn();
  const { withdraw } = useExit();

  // wire your wallet provider however your app gets one
  useEffect(() => {
    if (walletProvider) purseClient().setWalletProvider(walletProvider);
  }, [walletProvider]);

  async function fund() {
    const quote = await requestQuote(5); // USD, pinned to a fresh Chainlink round
    if (quote) await startDeposit(quote, undefined, address);
  }

  return (
    <div>
      <div>balance {snapshot.balanceGwei} gwei ({snapshot.status})</div>
      <button onClick={fund} disabled={depositStatus !== "idle"}>fund $5</button>
      <button onClick={() => burn("one line on zkAPI", "be terse")}>ask</button>
      <pre>{streamingText}</pre>
      <button onClick={() => withdraw(address)}>withdraw</button>
    </div>
  );
}
```

Deposit goes to the vault onchain, the note commitment lands, and from then on the chain only ever sees nullifiers and proofs. Withdrawal is a mutual close back to any address.

## Hooks

`usePurse()` funds and watches the note. Returns `snapshot`, `journal`, `quote`, `requestQuote(usd: number)`, `startDeposit(quote, provider?, userAddress)`, `depositStatus`, `errorCode`, `errorMessage`, `reset`.

`useBurn()` runs the spend loop: prove, lease an ephemeral inference key, stream from OpenRouter, settle the actual burn. Returns `burn(prompt, systemPrompt?)`, `streamingText`, `status`, `receipts`, `currentReceipt`, `selectedModel`, `setSelectedModel`, `models`, plus the usual `errorCode` / `errorMessage` / `reset`. The receipt that lowers the note balance installs a beat after settlement, so the hook waits for the settled figure instead of eyeballing a balance diff. That number is the real onchain cost.

`useExit()` closes the note. Returns `withdraw(recipientAddress)`, `status`, `withdrawalDetails`, `errorCode`, `errorMessage`, `reset`.

`useModelCatalog()` just returns the model list (`readonly ModelOption[]`). It starts from a curated set and merges the live OpenRouter catalog once it loads, bucketed into the protocol's spend tiers.

All four talk to one client instance. Subscribe from anywhere.

## Client

```ts
const client = purseClient();
```

- `setWalletProvider(provider)`, before the first deposit
- `getSnapshot()` / `subscribe(fn)`: balance, status, latest root, note fingerprint
- `getHealth()` / `subscribeHealth(fn)` / `checkHealth()`: operator root and mode
- `getJournal()`: deposits, burns and withdrawals in one list
- `requestDepositQuote(usd)`: USD to ETH off a fresh oracle round
- `startDeposit(ethAmount, from, onStatus)`: full flow, wallet tx to note install
- `acquireAccess(sessionId, limitUsd, onProgress)`: prove and lease the inference key
- `settleLease()`: settle the burn
- `withdrawMutual(destination, onStatus)`: close out
- `formatMoney(gwei)`: display string

`configurePurse(deployment)` swaps the target deployment. Useful for self-hosted operator stacks.

There are also small helpers exported for money (`ethToGwei`, `formatEth`, `formatUsd`, `checkChargeCap`), display (`shortenFingerprint`, `formatNullifier`, `formatRelativeTime`), model math (`estimateSessionCostUsd`, `mapOpenRouterModel`, `mergeCatalog`) and a retry wrapper. Import what you need from the root.

## Errors

Every protocol error code has an entry in `ERROR_CATALOG` with a stable code, severity, plain user message and a recommended action. One recovery attempt fires automatically before anything surfaces to the UI. Show `entry.userMessage`, keep the raw protocol strings in your logs, not on screen.

```ts
import { getErrorCatalogEntry } from "@openzk.app/purse";
const entry = getErrorCatalogEntry("insufficient_balance");
```

## Networks

`mainnet` (chain 1, default, real funds), `sepolia` (11155111, testnet), `localnet` (bring your own deployment and browser config). Charge caps and lease TTLs come from the deployment manifest, not from this package, and a mismatch fails closed.

One honest note: this is client tooling for a young protocol. Cap your per-session spend (`acquireAccess` takes the limit) and treat mainnet balances accordingly.

## License

MIT
