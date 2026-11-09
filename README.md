<p align="center">
  <img src="static/icons/icon-128.png" width="96" height="96" alt="">
</p>

<h1 align="center">SignLens</h1>

<p align="center">
  <strong>See what a Solana transaction does before you sign it.</strong><br>
  Not just what leaves your wallet, but where it goes and what it does.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/signlens-beta/anihjjfeahahigbnjonlacmboeeolnmk"><img src="https://img.shields.io/badge/Chrome_Web_Store-install-4285F4?logo=googlechrome&logoColor=white" alt="Install from the Chrome Web Store"></a>
  <a href="https://addons.mozilla.org/firefox/addon/signlens-beta/"><img src="https://img.shields.io/badge/Firefox_Add--ons-install-FF7139?logo=firefoxbrowser&logoColor=white" alt="Install from Firefox Add-ons"></a>
  <a href="https://github.com/signlens/signlens-extension/actions/workflows/ci.yml"><img src="https://github.com/signlens/signlens-extension/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/deposit-dark.png">
    <img src="docs/images/deposit-light.png" width="440" alt="The SignLens window on a deposit: OK, Deposit 4,635.28675 USDC (verified) into Kamino Lend as collateral; what it does, from your wallet to Kamino Lend, the fee and how long it is valid; and Reject and Continue to Phantom">
  </picture>
</p>

SignLens works alongside the Solana wallet you already use (Phantom, Backpack,
Solflare, or any other Wallet Standard wallet). When you connect SignLens in a
dapp, every signing request opens in SignLens first with a plain-English
explanation of the transaction, and is only forwarded to your wallet if you
choose to continue. Your wallet still prompts you to approve or reject as
usual. SignLens holds no keys and never signs anything.

- **Explains every instruction in plain English.** Deposits, swaps, liquidity
  positions, stakes, perps orders, and multisig proposals—showing who sends
  what to whom, the network fee, and how long the signature stays valid.
- **Catches what balance previews miss.** Token spending approvals, account
  ownership transfers, non-expiring durable-nonce signatures, and address-poisoning
  lookalikes.
- **Blocks what it cannot decode.** Any unrecognized program is flagged as
  unknown and blocked by default—never assumed safe.
- **Keeps your wallet in control.** Your wallet receives the exact transaction
  bytes SignLens explained; even if a page mutates the transaction afterward,
  nothing changes.
- **Open source and reproducibly built.** All browser extension code lives in
  this repository, and every release builds to identical bytes from source.

Available in English and Simplified Chinese for Chrome, Brave, Edge, and Firefox.

> **Beta.** Transaction explanations are computed by the SignLens API, which
> receives each transaction to decode it and logs only the verdict and finding
> codes, not the transaction bytes. See [Privacy](#privacy) for details on what
> leaves your browser.

## One balance preview, five different transactions

Before you sign, a wallet typically shows your estimated balance change, for
example, `-100.29 USDC`. It does not tell you where those tokens are going or
what the transaction actually does. A lending deposit, a liquidity position, a
stake, a leveraged perps order, and a wallet drain can all look identical in a
balance preview. SignLens decodes every instruction in the transaction and
explains what it actually does.

Here is how five real mainnet transactions compare between a standard wallet
preview and SignLens:

| On | Leaves your wallet | SignLens says |
|---|---|---|
| Kamino | 4,635.28675 USDC | Deposit 4,635.28675 USDC (verified) into Kamino Lend as collateral |
| Raydium | 33.874114 USDC, 0.00985543 GOOGLx | Open a Raydium CLMM position with ≤ 0.00985543 GOOGLx (verified) and ≤ 33.874114 USDC (verified) |
| Orca | 2.0004 SOL, 0.0019912 ETH | Open an Orca Whirlpool position from tick -54248 to tick -54240; Add ≤ 2.0004 SOL (verified) and ≤ 0.0019912 ETH (verified) to an Orca Whirlpool position |
| Jito | 0.0511 SOL | Stake 0.0511 SOL in a stake pool for its pool token, at the pool's ratio at execution |
| Jupiter | 1.922511449 SOL | Place a long Jupiter Perps limit order of 10457.567852 USD with 1.922511449 SOL collateral, triggered below 117.5 USD |

Below the summary, the window breaks down each step: who sends what to whom
(e.g., *"You send 4,635.28675 USDC from Your wallet to Kamino Lend"*), the
transaction fee, how long the signature remains valid, and protocol-specific
details such as which stake pool receives your SOL (*"JitoSOL stake pool"*) and
which account receives the resulting token.

- `(verified)` indicates a token or protocol account that SignLens verified by
  its on-chain address rather than trusting its self-reported name or symbol.
- `≤` indicates a maximum amount where the program may consume less at execution.

## What a balance preview can't show

Some of the most dangerous transactions transfer nothing at the moment you sign
them—so a balance preview shows no change at all—because they grant permission
to take your funds later. SignLens highlights these risks directly below the
verdict:

- **Spending approvals (delegations).** *"Lets … spend an UNLIMITED amount from
  this token account at any time"* (or up to a specified cap) without asking for
  another signature.
- **Account ownership transfers.** Handing your token account or wallet account
  over to a new owner or program, giving it full control over everything inside.
  SignLens blocks these automatically.
- **Signatures that never expire.** Transactions built with a durable nonce
  remain valid until that nonce is consumed, allowing whoever holds the
  signature to broadcast it weeks or months later; the window warns `"Valid FOREVER"`.
- **Lookalike addresses (address poisoning).** An address that matches the
  first and last four characters of one of your own wallets or saved contacts
  to trick you into sending funds to an attacker.
- **Swaps paying out to another address.** *"The swap's output goes to an
  account that is not yours."*
- **Unrecognized programs.** Flagged as unknown and blocked by default, never
  treated as safe.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/window-dark.png">
    <img src="docs/images/window-light.png" width="440" alt="The SignLens window on a USDC transfer: a warning that the signature never expires, what the transaction does to you, the simulated outcome, and Reject and Continue to Phantom">
  </picture>
</p>

## Four verdicts

| Verdict | What it means |
|---|---|
| **OK** | SignLens decoded every instruction and found no warnings or critical issues. |
| **Warning** | Important findings you should review before approving, displayed at the top of the window. |
| **Blocked** | A critical risk, or part of the transaction could not be decoded. SignLens blocks the transaction unless you explicitly click "Continue anyway" and confirm why on a second prompt. |
| **Error** | No explanation could be produced (for example, the API was unreachable). Because nothing is known about the transaction, it is treated as blocked rather than allowed through; click "Try again" to retry. |

RPC simulation results are shown as unverified claims from your RPC rather than
guaranteed outcomes, and are cross-checked against the decoded instructions—if
the simulation takes more from your accounts than the decoded instructions
state, SignLens flags it as a finding. The extension popup also keeps a history
of your recent requests and whether they were approved, rejected, or blocked.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/popup-dark.png">
    <img src="docs/images/popup-light.png" width="360" alt="The SignLens popup: the API ready, and three requests, a warning passed on, an OK swap passed on, and a blocked swap rejected">
  </picture>
</p>

## Install

| Browser | Store link |
|---|---|
| Chrome, Brave, Edge (111+) | [Chrome Web Store](https://chromewebstore.google.com/detail/signlens-beta/anihjjfeahahigbnjonlacmboeeolnmk) |
| Firefox (140+) | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/signlens-beta/) |

*(In Edge, enable "Allow extensions from other stores" to install from the Chrome Web Store.)*

### Installing from GitHub Releases (reproducible zip)

If you want to verify the exact bytes you run, download
`signlens-extension-X.Y.Z.zip` (Chrome) or
`signlens-extension-firefox-X.Y.Z.zip` (Firefox) from
[GitHub Releases](https://github.com/signlens/signlens-extension/releases) and
verify the package as described in [Verifying a package](#verifying-a-package).

- **Chromium browsers:** Unzip the archive, open `chrome://extensions`, enable
  **Developer mode**, click **Load unpacked**, and select the unzipped folder.
- **Firefox:** Open `about:debugging#/runtime/this-firefox`, click **Load
  Temporary Add-on…**, and select the zip file. *(Firefox only keeps temporary
  add-ons until the browser restarts; for a persistent installation, install
  from Firefox Add-ons.)*

To build and load the extension from source, see [`DEVELOPMENT.md`](DEVELOPMENT.md).

> **Note for Firefox users:** Firefox allows you to restrict an extension's
> access to websites. If the popup or setup page reports that the extension
> cannot reach the API, RPC, or token list, click **Allow https access** so
> SignLens can fetch explanations.

## Get started

1. **Add your wallet addresses.** On first install, SignLens opens a setup page
   where you can add your wallet addresses (so explanations refer to your
   accounts as *"you"*), see how to pin the extension, and review what data
   leaves your browser.
2. **Connect "SignLens" in a dapp.** Select **SignLens** wherever you normally
   pick your wallet. It connects through your existing wallet; if you have
   multiple wallets installed, SignLens asks once which wallet you want to sign
   with.
3. **Review, then decide.** Every signing request opens the SignLens window
   with a verdict, a one-line summary, and a step-by-step breakdown. Reject it
   directly, or continue to your wallet to sign as usual.

From the popup settings, you can:
- Change which wallet SignLens forwards requests to
- Switch to **watch-only mode** (connect as any address to inspect and explain
  transactions without signing)
- Uncheck **"Show the explanation and ask first"** so the window only interrupts
  you when a transaction is blocked or fails to decode
- Manage your address book of trusted contacts
- Configure a custom Solana RPC endpoint

See [Using SignLens](docs/guide.md) for the complete user guide.

## How it works

SignLens registers itself as a
[Wallet Standard](https://github.com/anza-xyz/wallet-standard) wallet that
holds no private keys. When a dapp requests a signature, SignLens receives the
transaction bytes, explains them in its own popup window, and—only after you
click continue—forwards the exact same bytes to your real wallet to sign.

```
dapp ──signTransaction──▶ SignLens wallet ──bytes──▶ SignLens API ──▶ explanation window
                              │                     └─ lookup tables, simulation, accounts ◀── your RPC
                              └─ "Continue" ──▶ your wallet (Phantom, Backpack, …) ──▶ signs
```

All browser code lives in this repository, written in TypeScript and compiled
file-for-file without a bundler so the shipped JavaScript maps directly to the
source files. Release packages are built reproducibly and published with
SHA-256 checksums and GitHub build provenance attestations; see
[Verifying a package](#verifying-a-package).

### What it isn't

- **Not a wallet.** SignLens holds no keys and cannot sign transactions. Your
  wallet still prompts you for every signature.
- **Not financial advice or a guarantee.** An **OK** verdict means SignLens
  decoded every instruction and found no structural warnings—not that a trade
  is profitable or a token is legitimate. If an explanation looks wrong or
  unclear, you can report it using the feedback bar at the bottom of the window.
- **Not a guess.** Anything SignLens cannot decode is explicitly flagged as
  unknown and blocked rather than glossed over. RPC simulations are shown as
  unverified RPC claims, not ground truth.
- **Not offline (in this beta).** Explanations are computed by the SignLens API
  server, which receives the transaction to decode it; see [Privacy](#privacy)
  for what is logged.
- **Solana mainnet only.**

## Works with

SignLens decodes instructions at the program level, regardless of which website
or frontend builds the transaction. A Jupiter swap reads the same on `jup.ag` as
it does inside an embedded swap widget on another site.

- **Jupiter**: Aggregator v6, Order Engine, Limit Order v2, Perpetuals,
  Lend (Earn, Borrow, Flashloan), Lock, DAO staking and governance, Genie
  and merkle distributors, prediction market, Doves oracle
- **Kamino**: Lend, Lending Vault, Farms, Limit Orders, Scope
- **Meteora**: DLMM, DAMM v2, Dynamic Bonding Curve, Alpha Vault, Zap,
  liquidity distributor
- **Raydium**: AMM v4, CPMM, CLMM, LaunchLab, router
- **Orca**: Whirlpool
- **marginfi** (Project 0)
- **Pump**: Pump.fun, PumpSwap, Pump Fees, Pump stables router
- **Stake pools**: SPL Stake Pool (used by JitoSOL and many liquid staking tokens)
- **MetaDAO**: Futarchy, Conditional Vault
- **Squads**: v4 multisig (including the inner transaction inside a proposal)
- **Aggregators and routers**: DFlow, Titan, OKX DEX Router, 0x Settler,
  LI.FI, Rango, Binance router and fee router, Kobayashi router, Liquid
  Mesh router
- **Lighthouse**: assertion checks added by wallets to protect transactions
- **Solana native & SPL programs**: SOL transfers, SPL Token and Token-2022,
  Associated Token Accounts, native staking, compute budget and priority fees,
  memos, Address Lookup Tables (ALTs), program deployments and upgrades

Any program not on this list is flagged as unknown and its transaction is
blocked by default. SignLens is not affiliated with any of these projects;
all product and protocol names are trademarks of their respective owners.

## Privacy

In short:

- **Sent to the SignLens API** (when explaining a transaction): the transaction
  bytes, addresses loaded from its Address Lookup Tables, the RPC simulation
  outcome, your configured wallet addresses, and your address book addresses
  (so SignLens can distinguish saved contacts from lookalike addresses).
  Contact names never leave your browser, each name is replaced with a random
  per-request placeholder before leaving the extension.
- **Retained by the API**: for each explanation, the API logs only the verdict,
  finding codes, program names, transaction size, latency, and a hash of the
  transaction message. Full transaction bytes are **not** stored unless you
  explicitly check *"Send this transaction to SignLens so it can be looked
  into"* when submitting feedback.
- **Your IP address** is visible to Cloudflare, as with any Cloudflare-hosted
  service. The SignLens API uses it only in memory as a keyed hash for rate
  limiting and never writes it to disk or logs.
- **Your RPC** (by default `solana-rpc.publicnode.com`) is queried to resolve
  Address Lookup Tables, simulate transactions, and read on-chain accounts
  referenced by an explanation. Unlisted token mints are queried against your
  RPC and a token list (by default Jupiter's). Simulation, account lookup, and
  token lookup can each be disabled in settings, and you can configure your own
  RPC and token list URLs.
- **Feedback ratings** send nothing unless you click a rating button, and the
  feedback bar explains what data is included before you submit.
- **Off-chain messages (`signMessage`)** never leave the extension. Furthermore,
  the connected dapp never learns the explanation or verdict.

For a full breakdown of every network request and payload, see
[Privacy in Using SignLens](docs/guide.md#privacy) and the privacy policy at
<https://signlens.dev/privacy>.

## Verifying a package

Each release corresponds to a `vX.Y.Z` tag on the default branch matching the
version in `package.json` and its corresponding section in `CHANGELOG.md`
(`node scripts/release-notes.ts X.Y.Z` prints the release notes).

During a release, CI runs the full test suite (including end-to-end tests
against the API), runs `npm ci && npm run package`, and attaches
`signlens-extension-X.Y.Z.zip` (Chrome) and
`signlens-extension-firefox-X.Y.Z.zip` (Firefox), along with their `.sha256`
checksum files and GitHub build provenance attestations. Packages are built as
uncompressed (`store`-only) zip archives with sorted file entries and fixed
timestamps, ensuring byte-for-byte reproducibility across Linux, macOS, and
Windows.

From the directory containing your downloaded release files, verify the
checksums and build provenance attestations:

```sh
sha256sum -c signlens-extension-X.Y.Z.zip.sha256 signlens-extension-firefox-X.Y.Z.zip.sha256
# on macOS: shasum -a 256 -c signlens-extension-X.Y.Z.zip.sha256 signlens-extension-firefox-X.Y.Z.zip.sha256
gh attestation verify signlens-extension-X.Y.Z.zip --owner signlens
gh attestation verify signlens-extension-firefox-X.Y.Z.zip --owner signlens
```

You can also rebuild the packages from source at the release tag and verify
that your local build produces the exact same bytes:

```sh
git checkout vX.Y.Z && npm ci && npm run package
cd dist && sha256sum -c ~/Downloads/signlens-extension-X.Y.Z.zip.sha256 ~/Downloads/signlens-extension-firefox-X.Y.Z.zip.sha256
```

*(Note: Chrome Web Store and Firefox Add-ons re-sign uploaded packages with
their own store signatures, so store-installed archives will differ from the
raw release zips.)*

## Reporting a problem

- **Wrong or unclear explanation:** Use the feedback bar directly below the
  explanation in the SignLens window.
- **Extension bug:** Open an issue in this repository.
- **Security vulnerability** (e.g., spoofing an explanation, bypassing user
  confirmation, or leaking data contrary to our privacy guarantees): Please do
  **not** open a public issue; email `security@signlens.dev` as outlined in
  [`SECURITY.md`](SECURITY.md).

For build instructions, architecture details, and contribution guidelines, see
[`DEVELOPMENT.md`](DEVELOPMENT.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Copyright 2026 Boris Onchev. Licensed under the Apache-2.0 License; see
[`LICENSE`](LICENSE).
