# SignLens for the browser

[![CI](https://github.com/signlens/signlens-extension/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/signlens/signlens-extension/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

See what a Solana transaction does before you sign it. SignLens registers
itself as a [Wallet Standard](https://github.com/anza-xyz/wallet-standard)
wallet that holds no keys: a dapp sends it what it wants signed, SignLens
explains it in its own window, and once you say so the request goes
unchanged to the wallet you actually sign with. You approve or reject there
as usual. SignLens only watches.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/window-dark.png">
    <img src="docs/images/window-light.png" width="440" alt="The SignLens window on a USDC transfer: a warning that the signature never expires, what the transaction does to you, the simulated outcome, and Reject and Continue to Phantom">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/popup-dark.png">
    <img src="docs/images/popup-light.png" width="360" alt="The SignLens popup: the API ready, and three requests, a warning passed on, an OK swap passed on, and a blocked swap rejected">
  </picture>
</p>

**Beta.** In this version the explanation is computed by SignLens's server:
the extension sends it the transaction with what it read itself (the
addresses the transaction's lookup tables load, the outcome of a simulation
on the RPC in the settings) and renders the answer. The server keeps
verdicts and finding codes, not the bytes; the transaction itself is kept
only when you tick "Send this transaction to SignLens so it can be looked
into" under its explanation. The end goal is the same explanation
computed inside the extension, offline. Asking for it is one function in
one module (`explainRemotely` in `src/worker/api.ts`); the feedback
strip, the API status and the API address in the settings are the
server's and would go with it.

```
dapp ──signTransaction──▶ SignLens wallet ──bytes──▶ SignLens API ──▶ explanation window
                              │                     └─ lookup tables, simulation ◀── your RPC
                              └─ "Continue" ──▶ your wallet (Phantom, Backpack, …) ──▶ signs
```

Everything that runs in your browser is in this repository, in TypeScript,
compiled file for file with no bundler, so the shipped scripts line up with
the sources. A release package is built reproducibly and published with
its SHA-256; see [Verifying a package](#verifying-a-package). How to
build and test it from the sources is in
[`DEVELOPMENT.md`](DEVELOPMENT.md).

## Install

From a release: download `signlens-extension-X.Y.Z.zip` (Chrome) or
`signlens-extension-firefox-X.Y.Z.zip` (Firefox) from the
[releases](https://github.com/signlens/signlens-extension/releases), and
check it as [Verifying a package](#verifying-a-package) says.

- Chromium browsers (Chrome, Brave, Edge, 111 or later): unzip it, open
  `chrome://extensions`, turn on "Developer mode", choose "Load unpacked"
  and pick the unzipped folder.
- Firefox (128 or later): open `about:debugging#/runtime/this-firefox`,
  choose "Load Temporary Add-on…" and pick the zip. Firefox keeps an
  add-on loaded this way only until it restarts; one that stays installed
  comes from addons.mozilla.org, once SignLens is there.

From the sources: [`DEVELOPMENT.md`](DEVELOPMENT.md) says how to build
both and load them.

Firefox lets you withhold an add-on's access to sites: if the popup says
the browser has not let the extension reach the API, the RPC and the token
list, press "Allow https access" there, or nothing can be explained.

In a dapp, connect "SignLens". By default it connects to the first other
wallet it finds in the page and passes every request on after explaining
it; the popup's settings pick the wallet from the ones found in the current
tab, switch to watch-only mode (connect as any address, explain, refuse),
turn off "Show the explanation and ask first" (in pass-through mode the
window still opens for what SignLens would refuse), list your own
addresses, keep an address book, and point the extension at another RPC
or API (https, or plain http to this machine only). A connect that finds
no wallet to pass to is refused and shown in the popup's requests, with
the wallets that were there. A dapp has to connect before it can ask for
anything, and asks one thing at a time: a second request while the first is
open is refused.

In watch-only mode no wallet stands behind SignLens to ask you before a
site learns the address, so SignLens asks: the first time a site connects,
a window shows which site wants to see which address, Deny first. An Allow
is kept for that site and that address; a Deny is not, and the site asks
again the next time it connects. Either way the popup's requests keep the
answer. A dapp reconnecting silently as it loads gets the address only
where you allowed it. The settings list the sites, those allowed for an
address you watched before marked so, and Revoke disconnects a site's open
pages. No page is told the watched address otherwise, whatever the mode.

The explanation calls "you" only addresses you gave SignLens: in
pass-through mode the ones under "Your addresses" in the settings, in
watch-only mode the watched one. The page says which address signs a
transaction, and a page can name its own, so that sending to it would
read as a move between your accounts. Before a transaction is explained,
SignLens checks the address the page names: in pass-through mode, one
that is not among yours opens a window with it beside yours, Reject
first. Reject refuses the request; "It's mine, add it" adds the address
to your settings and the request goes on to be explained. One yes is one
address: a request that names more than one not among yours is refused,
since a page could put yours beside its own. With "Show the explanation
and ask first" off, no window opens for it: the request is refused, and
your addresses go in the settings first. In watch-only mode a request
that names another address is refused. A message is not checked, since
nothing in it is explained as yours.

What goes to your wallet is SignLens's own copy of the bytes it explained,
taken when the dapp asked: a page that changes its transaction afterwards
changes nothing. The dapp is told whether the request was passed on,
rejected by you, or refused by SignLens and why (still busy with the
page's last request, its window could not open, no decision in time),
never the verdict or the explanation, since they depend on your address
book.

## What you see

Every request opens a window before it reaches your wallet, once SignLens
has read what it needs and asked the API. With "Show the explanation and
ask first" off, it opens, in pass-through mode, only for a request SignLens
would refuse (blocked, or an error); the rest go on as explained, and the
popup keeps them, marked "passed on, not asked". The verdict and the
one-line summary stay at the top and the buttons at the bottom; in
between, the findings, what the transaction does to you as a list ("You
send 0.5 SOL to …", "You pay a fee of …", "Valid FOREVER until …"), each
instruction with its fields, and the full text under toggles. A request
of several transactions shows each under its own heading, and the summary
at the top is the most serious one's. The window's title carries the
verdict and the site, so the window is known by them in the taskbar.

The verdict is one of four:

- **OK**: nothing beyond notes.
- **Warning**: findings to read before you approve, shown first.
- **Blocked**: the engine found something critical, or a part of the
  transaction it cannot explain (an unknown program, say), and will not
  call it safe. SignLens refuses it unless you choose "Continue anyway".
- **Error**: SignLens has no explanation to show. The API was away or
  refused, or answered with something that does not hold together, or with
  a verdict this version does not know. No answer at all, or a 502, 503 or
  530 (what a deploy, a restart or a busy server looks like), is tried
  once more after a pause of half a second, or of what the API's
  `Retry-After` asks for up to two, before it counts. The API explains
  ten transactions a minute for each address it is asked from (a request
  of several counts each), and refuses more, which shows as an error
  until a few seconds have passed. Nothing is known about the
  transaction, so it is treated as blocked, never as a pass.

An effect or a value of a kind this version does not know is shown as one,
not left out. Closing the window, or the dapp's page, refuses the request.
Under the explanation, a strip asks whether it was clear.

Simulation runs on your RPC and is shown as what it is, an unverified
claim held against the decoded instructions: more leaving than they state
is a finding, agreement is a quiet line. Tokens outside SignLens's verified
list are named from the RPC and a token list as claims, marked unverified.

## Privacy

Each request to explain a transaction sends the SignLens API the
transaction, the addresses its lookup tables load, the outcome of the
simulation if it ran, your addresses from the settings (in watch-only
mode the watched one, so the explanation can say "you"), and your
address book, names and
addresses, so contacts can be named; when the explanation leaves tokens
unnamed and token lookup is on, it asks again with their symbols. This
happens when the dapp asks, before the window opens, and also when "Show
the explanation and ask first" is off.

Every request reaches the API through Cloudflare, which sees your IP
address, as it does for any site it serves. The API takes the address
only to count your requests against its limit, in memory and as a keyed
hash, and logs it nowhere.

The RPC in the settings, by default the public
`solana-rpc.publicnode.com`, is asked for the lookup tables of every
transaction that uses any, sees the whole transaction when simulation is
on, and the mints of unlisted tokens when token lookup is on. Those mints
also go to the token list, by default Jupiter's `lite-api.jup.ag`.
Simulation and token lookup are on by default; the settings turn them off.
A transaction the dapp names as for another chain than mainnet goes to the
same RPC all the same, since the name is only the dapp's word; the window
shows the chain it named.

Of an explanation, the API logs the verdict, the finding codes, the
program names, the size, the latency and a hash of the message, and keeps
nothing else. What a rating sends is kept, as below, and the bytes only
when you send them through the feedback strip.

The feedback strip sends nothing until you rate an explanation, and says
what a rating sends before you give one. A rating sends, for each
transaction explained: the rating, your comment (up to 2,000 characters,
the same for each), the explanation's digest (a hash of the transaction's
message), the site's host (in Firefox only once you allow it: Firefox
asks the first time you rate, and "Permissions and data" in its add-on
manager changes the answer), the wallet method it called, the extension's
version, and what the window showed you: the verdict, the one-line
summary, the findings by code and severity, and the program each
instruction calls, read from the transaction in the extension. The
transaction itself, with the addresses its lookup tables loaded, goes only
if you ticked "Send this transaction to SignLens so it can be looked
into", which is offered under every explanation, unticked, so a rendering
SignLens called OK but you rated wrong can be explained again as you saw
it. It goes to the API in the settings when you rate "Clear", or when
you decide, closing the window included. Messages to sign
never leave the extension, and the dapp learns neither the explanation nor
its verdict, nor, in watch-only mode, the watched address until you allow
it.
The settings show each address. The RPC and the token list can be your
own; the API's address is there for development, since the API's source
is not public.

## Verifying a package

A release is a tag `vX.Y.Z` on the default branch that names the version in
`package.json`, and whose version has a section in `CHANGELOG.md`: that
section is the release's notes (`node scripts/release-notes.ts X.Y.Z`
shows them). CI runs every test, the end-to-end suite against the API
included, runs `npm ci && npm run package`, and attaches
`signlens-extension-X.Y.Z.zip` (Chrome) and
`signlens-extension-firefox-X.Y.Z.zip`, each with its `.sha256`, to the
release, with a build provenance attestation. A package is a store-only
zip with sorted entries and fixed timestamps, so the same source gives the
same bytes anywhere; CI builds it on Linux, macOS and Windows and compares.

In the directory you downloaded the release's files to, check each
package against its `.sha256` and its attestation:

```sh
sha256sum -c signlens-extension-X.Y.Z.zip.sha256 signlens-extension-firefox-X.Y.Z.zip.sha256
# on macOS: shasum -a 256 -c signlens-extension-X.Y.Z.zip.sha256 signlens-extension-firefox-X.Y.Z.zip.sha256
gh attestation verify signlens-extension-X.Y.Z.zip --owner signlens
gh attestation verify signlens-extension-firefox-X.Y.Z.zip --owner signlens
```

Rebuilt from the tag, both come out the same bytes; check them against the
release's `.sha256` files from the `dist/` the build writes to:

```sh
git checkout vX.Y.Z && npm ci && npm run package
cd dist && sha256sum -c ~/Downloads/signlens-extension-X.Y.Z.zip.sha256 ~/Downloads/signlens-extension-firefox-X.Y.Z.zip.sha256
```

## Reporting a problem

An explanation that read wrong or unclear: the feedback strip under it,
which is what it is for. A bug in the extension: an issue in this
repository. A way to make SignLens show a transaction as something it is
not, pass a request on without your decision, or send what it says it
does not: not an issue, but an email to security@signlens.dev, as
[`SECURITY.md`](SECURITY.md) says.

## License

Copyright 2026 Boris Oncev. Apache-2.0, see [`LICENSE`](LICENSE).
