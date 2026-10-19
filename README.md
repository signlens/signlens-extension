# SignLens for the browser

See what a Solana transaction does before you sign it. SignLens registers
itself as a [Wallet Standard](https://github.com/anza-xyz/wallet-standard)
wallet that holds no keys: a dapp sends it what it wants signed, SignLens
explains it in its own window, and once you say so the request goes
unchanged to the wallet you actually sign with. You approve or reject there
as usual. SignLens only watches.

**Beta.** In this version the explanation is computed by SignLens's server:
the extension sends it the transaction with what it read itself (the
addresses the transaction's lookup tables load, the outcome of a simulation
on your own RPC) and renders the answer. The server keeps verdicts and
finding codes, not the bytes; the transaction itself leaves
for good only when you press "send this so it gets covered" on one SignLens
could not explain. The end goal is the same explanation computed inside the
extension, offline; the code is written so that the switch is a change to
one module (`src/api.ts`).

```
dapp ──signTransaction──▶ SignLens wallet ──bytes──▶ SignLens API ──▶ explanation window
                              │                     └─ lookup tables, simulation ◀── your RPC
                              └─ "Continue" ──▶ your wallet (Phantom, Backpack, …) ──▶ signs
```

Everything that runs in your browser is in this repository, in TypeScript,
compiled file for file with no bundler, so the shipped scripts line up with
the sources. A release package is built reproducibly and published with
its SHA-256; see [Verifying a package](#verifying-a-package).

## Install

Chromium browsers (Chrome, Brave, Edge, 111 or later): `npm install && npm
run build`, open `chrome://extensions`, turn on "Developer mode", choose
"Load unpacked" and pick the `extension/` directory. Firefox (128 or
later): `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`,
choose "Load Temporary Add-on…" and pick `dist/firefox/manifest.json`.

In a dapp, connect "SignLens". By default it connects to the first other
wallet it finds in the page and passes every request on after explaining
it; the popup's settings pick the wallet from the ones found in the current
tab, switch to watch-only mode (connect as any address, explain, refuse),
turn the window off, keep an address book, and point the extension at
another RPC or API. A connect that finds no wallet to pass to is refused
and shown in the popup's requests, with the wallets that were there.

## What you see

Every request opens a window before anything else happens. The verdict
and the one-line summary stay at the top and the buttons at the bottom; in
between, the findings, what the transaction does to you as a list ("You
send 0.5 SOL to …", "You pay a fee of …", "Valid FOREVER until …"), each
instruction with its fields, and the full text under toggles. Three
verdicts: OK, warning, and blocked, the last for anything SignLens cannot
explain, which it refuses to call safe. An explanation the server could not
give is an error, never a pass. Under the explanation, a strip asks whether
it was clear.

Simulation runs on your RPC and is shown as what it is, an unverified
claim held against the decoded instructions: more leaving than they state
is a finding, agreement is a quiet line. Tokens outside SignLens's verified
list are named from the RPC and a token list as claims, marked unverified.

## Privacy

Each request to explain a transaction sends the SignLens API the
transaction, the addresses its lookup tables load, the outcome of the
simulation if it ran, the addresses of the accounts your wallet connected
with (so the explanation can say "you"), and your address book, names and
addresses, so contacts can be named. Your RPC sees the transaction when
simulation or token lookup is on. The API logs the verdict, the finding
codes, the program names, the size, the latency and a hash of the message,
and stores nothing else; bytes are kept only when you send them through
the feedback strip. The settings show the API address, and you can run
your own.

## Development

Node 24 or later.

```sh
npm install
npm run check           # Biome (lint and format) and the TypeScript compiler, strict
npm test                # the API client, the wire format, the settings, the renderer and the manifest, in Node
npm run build           # tsc: src/*.ts → extension/*.js, one file each
npm run test:e2e        # the extension in Chromium, against a running SignLens API
npm run package         # dist/signlens-extension-<version>.zip and its SHA-256
```

The end-to-end tests load the unpacked extension into Chromium, serve a
test dapp and a stub RPC on localhost, and relay the API calls to a
running SignLens API (`SIGNLENS_API_URL`, default `http://127.0.0.1:8787`),
counting them and refusing them when a test asks, so what the tests see is
what a user sees. The fixtures under `e2e/fixtures` are mainnet
transactions. CI runs the lint, the types, the Node tests and the build on
every change, and the end-to-end suite when the repository variable
`SIGNLENS_API_URL` names an API.

## Layout

| | |
|---|---|
| `src/injected.ts` | the Wallet Standard wallet in the page, and the hand-off to the real one |
| `src/content.ts` | relays between the page and the extension |
| `src/background.ts` | reads lookup tables and simulates on your RPC, asks the API, opens the window |
| `src/api.ts` | the API client: the engine's request in, the explanation document out |
| `src/types.ts` | the contract: the explanation document, the request, the feedback record |
| `src/solana.ts` | the little of Solana's wire format the worker needs |
| `src/render.ts` | renders an explanation document |
| `src/confirm.ts`, `src/popup.ts` | the window and the popup |
| `extension/` | the manifest, the pages, the styles and the icons; the compiled scripts land here |
| `scripts/` | the Firefox copy and the reproducible package |

## Verifying a package

A release is a tag `vX.Y.Z`. CI checks out the tag, runs `npm ci && npm run
package` and attaches `signlens-extension-X.Y.Z.zip` with its `.sha256` to
the release. The package is a store-only zip with sorted entries and fixed
timestamps, so the same source gives the same bytes anywhere:

```sh
git checkout vX.Y.Z && npm ci && npm run package
sha256sum dist/signlens-extension-X.Y.Z.zip      # matches the release's .sha256
```

## License

Copyright 2026 Boris Oncev. Apache-2.0, see [`LICENSE`](LICENSE).
