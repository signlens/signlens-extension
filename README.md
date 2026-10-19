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
on the RPC in the settings) and renders the answer. The server keeps
verdicts and finding codes, not the bytes; the transaction itself is kept
only when you tick "send this transaction to SignLens so it gets covered"
on one SignLens did not call OK. The end goal is the same explanation
computed inside the extension, offline. Asking for it is one function in
one module (`explainRemotely` in `src/api.ts`); the feedback strip, the API
status and the API address in the settings are the server's and would go
with it.

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
`npm run package` builds the store packages for both.

In a dapp, connect "SignLens". By default it connects to the first other
wallet it finds in the page and passes every request on after explaining
it; the popup's settings pick the wallet from the ones found in the current
tab, switch to watch-only mode (connect as any address, explain, refuse),
turn the window off (in pass-through mode it still opens for what SignLens
would refuse), keep an address book, and point the extension at another RPC
or API (https, or plain http to this machine only). A connect that finds no
wallet to pass to is refused and shown in the popup's requests, with the
wallets that were there. A dapp has to connect before it can ask for
anything, and asks one thing at a time: a second request while the first is
open is refused.

In watch mode no wallet stands behind SignLens to ask you before a site
learns the address, so SignLens asks: the first time a site connects, a
window shows which site wants to see which address, Deny first. The answer
is kept for that site and that address; a dapp reconnecting silently as it
loads gets the address only where you allowed it. The settings list the
sites, and Revoke disconnects a site's open pages. No page is told the
watched address otherwise, whatever the mode.

What goes to your wallet is SignLens's own copy of the bytes it explained,
taken when the dapp asked: a page that changes its transaction afterwards
changes nothing. The dapp is told whether the request was passed on or
refused, never the verdict or the explanation, since they depend on your
address book.

## What you see

Every request opens a window before it reaches your wallet, once SignLens
has read what it needs and asked the API. With the window off in the
settings, it opens, in pass-through mode, only for a request SignLens would
refuse (blocked, or not explained); the rest go on as explained, and the
popup keeps them. The verdict and the one-line summary stay at the top and
the buttons at the bottom; in between, the findings, what the transaction
does to you as a list ("You send 0.5 SOL to …", "You pay a fee of …",
"Valid FOREVER until …"), each instruction with its fields, and the full
text under toggles. Three verdicts: OK, warning, and blocked, the last for
anything SignLens cannot explain, which it refuses to call safe. An
explanation the server could not give, one that does not hold together, or
a verdict this version does not know, is an error, never a pass; an effect
or a value of a kind this version does not know is shown as one, not left
out. Closing the window, or the dapp's page, refuses the request. Under the
explanation, a strip asks whether it was clear.

Simulation runs on your RPC and is shown as what it is, an unverified
claim held against the decoded instructions: more leaving than they state
is a finding, agreement is a quiet line. Tokens outside SignLens's verified
list are named from the RPC and a token list as claims, marked unverified.

## Privacy

Each request to explain a transaction sends the SignLens API the
transaction, the addresses its lookup tables load, the outcome of the
simulation if it ran, the addresses of the accounts your wallet connected
with (so the explanation can say "you"), and your address book, names and
addresses, so contacts can be named; when the explanation leaves tokens
unnamed and token lookup is on, it asks again with their symbols. This
happens when the dapp asks, before the window opens, and also when the
window is off.

The RPC in the settings, by default the public
`solana-rpc.publicnode.com`, is asked for the lookup tables of every
transaction that uses any, sees the whole transaction when simulation is
on, and the mints of unlisted tokens when token lookup is on. Those mints
also go to the token list, by default Jupiter's `lite-api.jup.ag`.
Simulation and token lookup are on by default; the settings turn them off.
A transaction the dapp names as for another chain than mainnet is not sent
to the RPC.

The API logs the verdict, the finding codes, the program names, the size,
the latency and a hash of the message, and stores nothing else; bytes are
kept only when you send them through the feedback strip. Messages to sign
never leave the extension, and the dapp learns neither the explanation nor
its verdict, nor, in watch mode, the watched address until you allow it.
The settings show each address, and you can run your own.

## Development

Node 24 or later.

```sh
npm install
npm run check           # Biome (lint and format, the stylesheet included) and the TypeScript compiler, strict
npm test                # in Node: every module but the pages, the worker's against the stub RPC and a fake chrome
npm run build           # tsc: src/*.ts → extension/*.js, one file each
npm run test:e2e        # the extension in Chromium, against the API's recorded answers
npm run test:e2e:record # the same against a running SignLens API, recording its answers anew
npm run package         # the Chrome and Firefox packages under dist/, with their SHA-256s
```

The end-to-end tests load the unpacked extension into Chromium, serve a
test dapp and a stub RPC on localhost, and answer the API calls with what a
running SignLens API answered them, recorded under `e2e/fixtures/api/` (one
file per call: its method, path and body), counting them and refusing them
when a test asks. A call nothing was recorded for fails its test, and the
browser resolves no host but this machine, so the suite needs no network.
With `SIGNLENS_API_URL` set, the calls go to that API instead, and an
answer that differs from its recording fails its test, so the recordings
are known to hold; feedback is never sent, live or not.
`npm run test:e2e:record` runs the suite that way and records every answer
anew (`SIGNLENS_API_URL`, default `http://127.0.0.1:8787`). The fixtures
under `e2e/fixtures` are mainnet transactions and what the API made of
them.

On every change CI runs the lint, the types, the Node tests and the
end-to-end suite, and builds the package on Linux, macOS and Windows,
which must come out the same bytes. When the repository variable
`SIGNLENS_API_URL` names an API, the suite also runs against it; a
release requires that.

## Layout

| | |
|---|---|
| `src/injected.ts` | the Wallet Standard wallet in the page, its copy of the request, and the hand-off to the real one |
| `src/content.ts` | relays between the page and the extension |
| `src/background.ts` | the worker: answers a page's request, keeps the wallets each page has, routes the messages |
| `src/explain.ts`, `src/tables.ts`, `src/simulation.ts`, `src/hints.ts` | what a request is explained with: the lookup tables and the simulation over your RPC, names for unlisted tokens, and the API's answer as rows |
| `src/gate.ts`, `src/history.ts` | the window and the user's decision; the popup's history and the badge |
| `src/messages.ts`, `src/feedback.ts`, `src/text.ts` | the messages and who may send what; the feedback records; text from elsewhere, made safe to show |
| `src/api.ts` | the API client: the engine's request in, the explanation document out |
| `src/explanation.ts` | the explanation document as this version reads it: checked field by field, or refused with where it fails |
| `src/types.ts` | the contract: the explanation document, the request, the feedback record |
| `src/solana.ts` | the little of Solana's wire format the worker needs |
| `src/render.ts` | renders an explanation document |
| `src/verdict.ts` | the verdict words and which is worst, for the badge and the window |
| `src/settings.ts` | the settings, their defaults, and the endpoints accepted |
| `src/confirm.ts`, `src/popup.ts` | the window and the popup |
| `extension/` | the manifest, the pages, the styles and the icons; the compiled scripts land here |
| `scripts/` | the Firefox copy and the reproducible packages |
| `e2e/` | the end-to-end tests, the test dapp, and the stub RPC and API relay |

## Verifying a package

A release is a tag `vX.Y.Z` on the default branch that names the version in
`package.json`. CI runs every test, the end-to-end suite against the API
included, runs `npm ci && npm run package`, and attaches
`signlens-extension-X.Y.Z.zip` (Chrome) and
`signlens-extension-firefox-X.Y.Z.zip`, each with its `.sha256`, to the
release, with a build provenance attestation. A package is a store-only
zip with sorted entries and fixed timestamps, so the same source gives the
same bytes anywhere; CI builds it on Linux, macOS and Windows and compares.

```sh
git checkout vX.Y.Z && npm ci && npm run package
sha256sum dist/signlens-extension-X.Y.Z.zip      # matches the release's .sha256
gh attestation verify signlens-extension-X.Y.Z.zip --owner signlens
```

## License

Copyright 2026 Boris Oncev. Apache-2.0, see [`LICENSE`](LICENSE).
