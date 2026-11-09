# Using SignLens

This guide covers how SignLens behaves after installation: setting up and
connecting your wallet, understanding the explanation window, and seeing
everything that leaves your browser. For a high-level overview and installation
instructions, see the [README](../README.md).

## Using it

### Setup and addresses

A fresh installation opens a setup page in a new tab where you can enter your
wallet addresses (so SignLens doesn't have to ask a connected site first),
learn how to pin the extension, and review what leaves your browser. Updating
the extension does not reopen the setup page.

Your addresses are managed as a list both on the setup page and in the popup
settings—one full address per row with a **Remove** button and an input field
that validates Solana addresses. If you are in pass-through mode and haven't
added an address yet, the popup prompts you to add one inline, and the popup
settings link back to the setup page.

### Language

SignLens is available in English and Simplified Chinese for both the UI and
transaction explanations. By default, it uses the first matching language from
your browser settings, or you can override it using the **Language** selector
at the top of the setup page and popup settings. (Browsers configured for
Traditional Chinese default to English unless Simplified Chinese is explicitly
selected.)

### Connecting in a dapp (pass-through mode)

In a dapp, select **SignLens** from the wallet list. SignLens connects through
your real wallet and forwards every signing request to it after explaining the
transaction:

- If the page detects only one other wallet, SignLens selects it automatically.
- If multiple wallets are installed, SignLens opens a selection window on your
  first connection (listing each wallet with its icon) and remembers your
  choice. If a dapp reconnects silently on page load before you have chosen a
  wallet, SignLens selects the first available wallet without prompting.
- Another SignLens instance (such as a store build running alongside a
  development build) is never selected as the backing wallet.
- If no backing wallet is found, the connection is refused and logged in the
  popup along with the list of detected wallets.
- A dapp must connect before requesting a signature, and may only have one
  active request at a time—any concurrent request while a window is already
  open is refused.

From the popup settings, you can:
- Change the backing wallet (from those detected in the active tab)
- Switch to **watch-only mode** (connect as any address, explain transactions,
  and refuse signing)
- Uncheck **"Show the explanation and ask first"** (in pass-through mode, the
  window will then open only for transactions that are blocked or fail with an
  error)
- Manage **Your addresses** and your **Address book**
- Configure a custom RPC or API URL (`https://`, or `http://` for `localhost` /
  loopback only)

### Watch-only mode

In watch-only mode, there is no backing wallet behind SignLens to prompt you
before revealing your address to a website, so SignLens asks you directly:

- The first time a site connects, SignLens opens a prompt showing which site
  wants to view which watched address, with **Deny** focused first.
- Clicking **Allow** remembers the permission for that site and address;
  clicking **Deny** does not, so the site will ask again if you reconnect.
  Both decisions are recorded in the popup's request log.
- Silent reconnections on page load succeed only for previously allowed sites.
- The popup settings list all allowed sites (marking any that were authorized
  for a previously watched address), and clicking **Revoke** immediately
  disconnects any open tabs for that site.
- Outside of an approved connection, no page can read your watched address.

### How SignLens identifies "you"

Explanations only label an address as *"you"* if you configured it:
- In **pass-through mode**, the addresses listed under **Your addresses** in
  settings.
- In **watch-only mode**, the currently watched address.

Each API request includes at most 8 of your own addresses (prioritizing those
referenced by the page) and up to 64 contacts from your address book.

Because a malicious dapp could claim that its own address is the signer—which
would make a transfer to the attacker look like a transfer between your own
accounts—SignLens verifies the signer address specified by the page before
requesting an explanation:
- In **pass-through mode**, if the page names a signer address that is not in
  **Your addresses**, SignLens opens a prompt displaying the unknown address
  next to yours, with **Reject** focused first. Clicking **Reject** refuses the
  request; clicking **"It's mine, add it"** saves the address to your settings
  and proceeds to explain the transaction.
- You can only approve one unknown signer address at a time. If a request
  includes multiple unknown signer addresses, SignLens refuses it automatically
  (preventing a page from bundling its own address alongside yours).
- If **"Show the explanation and ask first"** is unchecked, SignLens does not
  prompt for unknown signer addresses—it refuses the request immediately until
  you add the address in settings.
- In **watch-only mode**, any request naming an address other than the watched
  address is refused.
- Off-chain messages (`signMessage`) skip this check because message contents
  are not decoded as account transfers.

### Byte integrity and dapp responses

When you click continue, SignLens forwards its own snapshot of the transaction
bytes captured when the dapp first made the request—if the page mutates its
transaction object afterward, those changes have no effect.

The dapp receives only the standard wallet outcome (whether the request was
forwarded, rejected by you, or refused because SignLens was busy, couldn't open
a window, or timed out)—never the verdict or explanation, which depend on your
private address book.

## What you see

Every signing request opens the SignLens window before reaching your wallet,
once SignLens has gathered the necessary on-chain context and queried the API.
If **"Show the explanation and ask first"** is unchecked in pass-through mode,
the window opens only when SignLens blocks the transaction or encounters an
error; **OK** and **Warning** transactions are forwarded automatically and
logged in the popup as *"passed on, not asked"*.

Inside the window:
- The **verdict** and **one-line summary** stay pinned at the top, and the
  action buttons stay pinned at the bottom.
- In between, SignLens displays any **findings**, a step-by-step list of **what
  the transaction does to you** (e.g., *"You send 0.5 SOL to …"*, *"You pay a
  fee of …"*, *"Valid FOREVER until …"*), each decoded instruction with its
  parameters, and collapsible raw details.
- For batch requests containing multiple transactions, each transaction appears
  under its own heading, and the top banner reflects the most severe verdict
  across the batch.
- The window title includes the verdict and the requesting site's domain so you
  can easily identify it in your OS taskbar.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/popup-dark.png">
    <img src="images/popup-light.png" width="360" alt="The SignLens popup: the API ready, and three requests, a warning passed on, an OK swap passed on, and a blocked swap rejected">
  </picture>
</p>

### The four verdicts

- **OK**: Every instruction was decoded and nothing beyond informational notes
  was found.
- **Warning**: Findings you should read carefully before approving, shown at
  the top of the window.
- **Blocked**: The engine found a critical risk or a part of the transaction it
  cannot explain (such as an unknown program) and refuses to call it safe.
  SignLens blocks the request unless you click **"Continue anyway"** and then
  explicitly confirm on a second prompt explaining the risk.
- **Error**: SignLens could not produce an explanation—for example, the API was
  unreachable, returned an invalid response, or returned a verdict unknown to
  this extension version.
  - Network failures or HTTP `502`, `503`, or `530` responses (typical during a
    server deploy, restart, or spike) are automatically retried once after
    500 ms (or the server's `Retry-After` header, up to 2 seconds).
  - The API rate-limits requests to 10 transactions per minute per IP (each
    transaction in a batch counts individually). Exceeding this limit shows an
    error for a few seconds; in a batch request, remaining transactions after
    the first rate-limited one are skipped and noted accordingly.
  - Because nothing is known about a transaction when an error occurs, SignLens
    treats it as **Blocked** (fail-closed), never as a pass. You can click
    **"Try again"** while the request is open to retry using your current
    settings.
  - A single batch request may contain at most 32 transactions.

If the API returns an effect or value type introduced after your extension
version was released, SignLens displays it explicitly as an unrecognized item
rather than hiding it. Closing the window or closing the requesting dapp tab
refuses the request. Below each explanation, a feedback bar lets you rate
whether the explanation was clear.

### RPC simulations and on-chain lookups

- **Simulations** run on your configured RPC and are presented as unverified
  RPC claims cross-checked against the decoded instructions: if the simulation
  reports more funds leaving your accounts than the decoded instructions state,
  SignLens raises a finding; if they agree, it shows a quiet confirmation line.
- **Unlisted tokens** outside SignLens's built-in verified list are resolved
  via your RPC and token list and explicitly marked as unverified claims.
- **Account-dependent instructions**: Some instructions only reference an
  on-chain account whose contents determine what actually happens—for example,
  approving a Squads multisig proposal signs a reference to an on-chain
  proposal account that holds the inner transaction, and a Jupiter DAO vote
  signs an option index defined in the proposal account. When the API reports
  which accounts it needs to read, SignLens fetches those accounts from your
  RPC, re-queries the API with their data, and displays the result as an
  unverified RPC claim (which can never downgrade a warning or block finding).

## Privacy

### What is sent to the SignLens API

When explaining a transaction, the extension sends the SignLens API:
- The raw transaction bytes
- The addresses resolved from any Address Lookup Tables (ALTs)
- The RPC simulation outcome (if simulation is enabled)
- Your configured wallet addresses (or the watched address in watch-only mode)
  so the explanation can label them as *"you"*
- The addresses in your address book, so SignLens can distinguish saved
  contacts from lookalike (address-poisoning) addresses

**Your contact names never leave your browser.** Each contact is sent with a
fresh random placeholder per request that reveals nothing about the label, and
the extension substitutes your real contact name locally when rendering the
window.

If an explanation requires on-chain account data (and account lookup is
enabled), the extension fetches those accounts from your RPC and re-queries the
API up to twice. Similarly, if the transaction involves unlisted tokens (and
token lookup is enabled), the extension re-queries the API with their resolved
symbols. These requests happen automatically when a dapp requests a signature,
even when **"Show the explanation and ask first"** is turned off.

### IP addresses and Cloudflare

All requests to the SignLens API pass through Cloudflare, which sees your IP
address just like any other Cloudflare-hosted website. The SignLens API uses
your IP address only in memory as a keyed cryptographic hash for rate limiting
and never writes it to disk or logs.

### What is sent to your RPC and token list

Your configured RPC (by default `solana-rpc.publicnode.com`) is queried for:
- Address Lookup Tables used by a transaction
- The full transaction when **Simulation** is enabled
- Specific on-chain accounts named by an explanation (such as a multisig
  proposal or DAO governance proposal) when **Account lookup** is enabled
- Mint accounts of unlisted tokens when **Token lookup** is enabled (these mint
  addresses are also queried against your configured token list, by default
  Jupiter's `lite-api.jup.ag`)

Simulation, account lookup, and token lookup are enabled by default and can
each be turned off in settings. Even if a dapp labels a request as targeting a
non-mainnet cluster, SignLens queries the same configured RPC (since the
cluster label is self-reported by the dapp) and displays the cluster name the
dapp claimed.

### What the SignLens API logs

For each explanation, the API logs only:
- The verdict
- The finding codes
- The invoked program names
- The transaction byte size and processing latency
- A hash of the transaction message

The API retains **nothing else** from an explanation request. Full transaction
bytes are stored **only** if you explicitly check *"Send this transaction to
SignLens so it can be looked into"* in the feedback bar.

### Feedback ratings

The feedback bar sends nothing unless you submit a rating, and explains what
data will be sent before you click. When you submit a rating, the extension
sends (for each transaction in the request):
- Your rating and optional comment (up to 2,000 characters)
- The explanation digest (a hash of the transaction message)
- The requesting site's hostname and the extension version *(in Firefox, only
  after you grant permission when prompted on your first rating; you can change
  this anytime under "Permissions and data" in Firefox's add-on manager)*
- The wallet method called by the dapp
- What the window displayed to you: the verdict, the one-line summary (with any
  contact names redacted to `"a contact"`), the finding codes and severities,
  and the program IDs read from the transaction

The raw transaction bytes (and its resolved lookup table addresses) are
included **only** if you check **"Send this transaction to SignLens so it can
be looked into"** (unchecked by default), allowing our team to reproduce an
explanation that was marked **OK** but looked wrong to you. Ratings are sent
when you click **"Clear"** or when you finish deciding on the transaction
(including closing the window).

### Local-only data

- **Off-chain messages (`signMessage`)** never leave the extension.
- **Connected dapps** never learn the explanation or verdict, nor do they learn
  your watched address in watch-only mode unless you click **Allow**.
- **Custom endpoints:** Every endpoint URL is visible in settings. You can point
  the extension at your own RPC and token list; the API URL setting is provided
  for local development, as the backend engine source is not public.
