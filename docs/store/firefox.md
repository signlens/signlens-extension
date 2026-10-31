# Firefox Add-ons (addons.mozilla.org)

What SignLens's listing on addons.mozilla.org says, and how a version is
submitted. Each field below is pasted as it is; the screenshots and the
icon are the files beside this one.

## Submitting a version

1. A Mozilla account with two-step authentication, which the store
   requires of developers, and its developer agreement accepted at
   <https://addons.mozilla.org/developers/>.
2. **Submit a New Add-on**, **On this site**, the first time; afterwards
   **Upload New Version** on the add-on's page.
3. The package: `signlens-extension-firefox-X.Y.Z.zip` from the GitHub
   release, the same bytes `npm run package` builds. Platforms: Firefox for
   desktop only; leave Firefox for Android unticked (the store's validator
   warns that Android 140 predates its data-consent support, which does
   not apply to a desktop add-on).
4. Source code: **Yes**. The release's source archive: GitHub's "Source
   code (zip)" for the tag, or `git archive --format=zip -o
   signlens-extension-src-X.Y.Z.zip vX.Y.Z`. The reviewer rebuilds it as
   [`DEVELOPMENT.md`](../../DEVELOPMENT.md#building-for-review) says.
5. The listing fields below, the first time, and the notes to the reviewer.
   Release notes for a version: its section of `CHANGELOG.md`
   (`node scripts/release-notes.ts X.Y.Z`).
6. **Experimental**: no. **Requires payment**: no.

The store signs the package it publishes: the `.xpi` Firefox installs has
Mozilla's signature added to the same files, so its bytes differ from the
release's zip, whose SHA-256 the release states.

## Listing

| Field | Value |
|---|---|
| Name | SignLens (beta), the manifest's (`locales/en/manifest.ftl`) |
| Add-on URL | `signlens` |
| Summary | the manifest's description, below |
| Categories | Privacy & Security |
| Tags | solana, wallet, crypto, security, phishing, web3 |
| Homepage | <https://signlens.dev> |
| Support email | support@signlens.dev |
| Support site | <https://github.com/signlens/signlens-extension/issues> |
| License | Apache License 2.0 |
| Icon | `icon-64.png` |
| Default locale | English (US) |

### Summary

See what a Solana transaction does before you sign it. Explains every
signing request, then hands it unchanged to your own wallet. Beta: the
explanation is computed by SignLens's server.

### Description

```markdown
**SignLens explains, in plain words, each Solana transaction a dapp asks you to sign, before your wallet signs it, and says so when it cannot.**

Your wallet's preview shows what leaves your wallet. SignLens says where it goes and what it is for: a deposit into a lending market, a liquidity position, a stake, a leveraged order, or a drain.

**How it works**

- In a dapp, connect **SignLens** as your wallet. SignLens connects, in turn, to the wallet you already use: Phantom, Backpack, Solflare or another Solana wallet.
- Each request opens the SignLens window first: the verdict (OK, Warning or Blocked), what the transaction does, and what SignLens found.
- Continue, and the exact transaction SignLens explained goes to your wallet, which asks you as usual. SignLens holds no keys and signs nothing.

**What it warns about**

- An account or a whole wallet handed to someone else, which moves nothing when you sign
- Spending rights, an unlimited one spelled out
- Signatures that never expire (durable nonces)
- Addresses that only look like yours or a contact's
- Programs it has no reviewed description of, blocked rather than guessed
- Multisig approvals, with the proposal's steps read from your RPC
- A swap that pays someone else

**What it sends**

In this beta the explanation is computed by SignLens's server, api.signlens.dev. Each transaction you are asked to sign goes there, with the addresses it loads, a simulation's outcome, the accounts it names as your RPC returned them, your addresses and the addresses in your address book, so that the explanation can say "you" and tell your contacts from lookalikes; the names in your address book stay in your browser. The server keeps verdicts and finding codes, not the transaction. Your RPC, by default solana-rpc.publicnode.com, is asked for what the transaction refers to and simulates it. A rating sends nothing until you give one, and the site and SignLens's version only once you allow them. The privacy policy below, and https://signlens.dev/privacy, say it all.

Solana mainnet, on a computer. Open source under the Apache 2.0 licence, and built reproducibly: https://github.com/signlens/signlens-extension

SignLens is not affiliated with the wallets and projects whose programs it explains.
```

### Privacy policy

```text
SignLens privacy policy. Last changed 28 October 2026.

What the SignLens extension sends, to whom, and what is kept.

WHAT GOES TO THE SIGNLENS API
In this beta, SignLens's server (api.signlens.dev) computes the explanation. For each transaction a dapp asks you to sign, the extension sends the SignLens API: the transaction, the addresses its lookup tables load, the outcome of the simulation if it ran, your addresses from the settings (in watch-only mode the watched one), so that the explanation can say "you", and the addresses in your address book, so that a contact can be told from an address that only looks like one. The names in your address book never leave your browser: each goes as a random stand-in, new for each request, which says nothing of the name and which the extension replaces with the name in the explanation it shows you. When account lookup is on and the explanation names accounts it would read, such as a multisig proposal and the transaction it stores or a DAO proposal and its options, it asks again with those accounts as your RPC returned them, at most twice. When token lookup is on and the explanation leaves tokens unnamed, it asks again with their symbols. This happens when the dapp asks, before the window opens, and also when "Show the explanation and ask first" is off and no window opens.

For each request the API logs the time, how long it took, the verdict, the finding codes, the program names, the size and a SHA-256 hash of the transaction's message, and keeps nothing else. The hash cannot be turned back into the transaction, but once the transaction is on chain anyone can compute the same hash from it, so a log line can be matched to that transaction and its signer. Messages to sign never leave the extension.

YOUR IP ADDRESS
Every request reaches the API through Cloudflare, which sees your IP address, as it does for any site it serves. The API uses the address only to count your requests against its limit, in memory and as a keyed hash, and logs it nowhere.

YOUR RPC AND THE TOKEN LIST
The RPC in the settings, by default the public solana-rpc.publicnode.com, is asked for the lookup tables of every transaction that uses any, sees the whole transaction when simulation is on, is asked for the accounts an explanation names when account lookup is on, and for the mints of unlisted tokens when token lookup is on. Those mints also go to the token list, by default Jupiter's lite-api.jup.ag. Simulation, account lookup and token lookup are on by default; the settings turn them off, and the RPC and the token list can be your own.

FEEDBACK
The feedback strip under an explanation sends nothing until you rate it, and says what a rating sends before you give one. A rating sends, for each transaction explained: the rating, your comment, a hash of the transaction, the wallet method the site called, and what the window showed you: the verdict, the summary, with each of your contacts in it as "a contact", the findings by code and severity, and the program each instruction calls. It sends the site's host and SignLens's version only once you allow them: Firefox asks the first time you rate, and "Permissions and data" in its add-ons manager changes the answer. The transaction itself goes only if you tick "Send this transaction to SignLens so it can be looked into", which is offered unticked. Feedback is kept to improve the explanations; to have yours deleted, write to support@signlens.dev with the time you sent it.

WHAT THE DAPP LEARNS
The dapp is told whether the request was passed on, rejected by you, or refused by SignLens and why, never the verdict or the explanation. In watch-only mode it learns the watched address only once you allow it.

WHAT SIGNLENS DOES NOT DO
No accounts, no advertising, no selling or sharing of data, no tracking across sites. The extension's source is public: https://github.com/signlens/signlens-extension

QUESTIONS
Write to support@signlens.dev.
```

### Screenshots

Upload in this order, each with its caption.

1. `firefox-screenshot-1.png`: The SignLens window before your wallet signs: a deposit into Kamino Lend (OK), and a USDC transfer whose signature never expires (Warning).
2. `firefox-screenshot-2.png`: The same two, in the dark theme.
3. `firefox-screenshot-3.png`: The popup lists recent requests, what SignLens made of each and what you decided.

They are rendered from `screenshot-1.html` to `screenshot-3.html`, the
README's images side by side at 1280×800, the size the store shows:

```sh
for n in 1 2 3; do npx playwright screenshot --viewport-size=1280,800 file://$PWD/docs/store/screenshot-$n.html docs/store/firefox-screenshot-$n.png; done
```

`icon-64.png` is `docs/design/icon.svg` at 64 pixels, rendered from
`icon-64.html` the same way at `--viewport-size=64,64`, without a
background.

## Notes to the reviewer

```text
SignLens is a Solana wallet without keys. Dapps find wallets through the Wallet Standard, an event a page's scripts exchange; SignLens registers as one there, explains each transaction a dapp asks it to sign in its own window, and, once the user decides, passes the same bytes to the user's real wallet extension (Phantom, Backpack, Solflare), which signs as usual. It never holds keys or signs.

PERMISSIONS
- Content scripts on https pages (and localhost, for development): page/injected.js runs in the page's main world, because the Wallet Standard lives there, and only registers the "SignLens" wallet and relays its calls; page/content.js relays them to the background over a MessageChannel the page cannot reach. Neither reads nor changes the page's content; the content script reads only the page's origin, which goes with each request so that the window can name the site.
- Host permissions for https sites and localhost: the background sends requests to the SignLens API, the Solana RPC and the token list named in the settings, which the user may point at any https endpoint or at one on their own machine. Firefox lets the user withhold these; the popup then says so and offers "Allow https access".
- storage: the settings and the recent requests.

DATA
Declared in the manifest's data_collection_permissions, and set out in the privacy policy. Required: the transactions, addresses and accounts, the address book's addresses among them (financialAndPaymentInfo), which the explanation needs. The address book's names never leave the browser: the API is sent a random stand-in for each, new for each request, which says nothing of the name and which the extension replaces with the name in what it shows (src/worker/contacts.ts). Optional: the site a rating was given on (browsingActivity) and the extension's version (technicalAndInteraction), which Firefox asks about, in one question, from the click that gives the first rating (src/shared/consent.ts); a rating carries each only once allowed. Everything goes over https.

NO REMOTE CODE
Every script is in the package (the extension pages' CSP is script-src 'self'). The API answers JSON, which src/worker/explanation.ts checks field by field and the window shows as text.

SOURCE
The JavaScript is the TypeScript compiler's output, one file per source file, neither bundled nor minified. To rebuild: Node 26.1 or later (not 24: npm ci refuses an older Node), then "npm ci && npm run package"; dist/signlens-extension-firefox-X.Y.Z.zip comes out the same bytes as the package uploaded. DEVELOPMENT.md, "Building for review", has the details.

TRYING IT
No account is needed. In SignLens's popup, Settings: under "After explaining a request" choose "Refuse it (watch-only, no keys involved)", and in "Address to connect as" give any mainnet address that holds some SOL. On a dapp such as https://jup.ag, connect "SignLens" and start a swap: the SignLens window explains the transaction, and in watch-only mode every request is refused, so nothing is signed. With a Solana wallet extension installed, the default mode passes each request on to it after the window.

Desktop only: the validator's warning about Firefox for Android 140 concerns a platform this add-on is not submitted for.

Questions: support@signlens.dev
```
