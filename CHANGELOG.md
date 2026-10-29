# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Which wallet signs, asked once.** With "First one found" in the
  settings, SignLens passed requests to whichever wallet announced itself
  first in the page: MetaMask, Brave or OKX, say, for someone who signs
  with Phantom. Now a page with several wallets asks, the first time you
  connect, which one in a window of its own that lists them with their
  icons, and keeps your choice in the settings; closing it refuses the
  connect. An icon is shown only if it is an image as Wallet Standard has
  one (a data URL of SVG, WebP, PNG or GIF), never an address to fetch,
  and the wallet's initial in its place otherwise. A dapp
  reconnecting as it loads asks nothing and gets the first found, as
  before, and a page with one wallet gets that one. Another SignLens (a
  store build beside one built from the sources) is never the wallet
  behind it, where the two passed requests to each other.

- **A setup page.** A new install opens one in a tab of its own: your
  wallet addresses go there, so the first site that signs with one is
  not asked about first; how to use SignLens (choose SignLens in the
  dapp's list of wallets, not your wallet); how to pin it, ticked off
  once it is pinned where the browser can tell; and what leaves your
  browser. In Firefox, where the access to sites can be turned off, it
  asks for that too. Updates do not open it; the popup's settings do.

- **Try again.** When SignLens could not explain a transaction (the API
  away, busy or past its limit), the window offers "Try again": SignLens
  asks once more while the request waits, with the settings as they are
  then, and the same window shows what comes back, the decision still
  yours.
  Before, the only way was to reject and ask the site again. A request
  refused as a whole, as too many transactions, say, offers no button,
  since it would be refused again.

### Changed

- **"1 raw unit".** One raw unit reads in the singular, as the engine now
  writes it, where it read "1 raw units".

- **A token without a symbol, named in place.** An amount of a token
  SignLens does not list names it after "of", as the engine now does:
  "raw units of unverified token E7T1…pump", "of the token held in
  DKag…7hzh", "of the token at lookup table CpST…Swey[62]", where it
  read "of an unverified token" with the token in brackets after any
  note, the mint written in full.

- **Raw units grouped.** A token's amount in raw units groups its digits
  ("20,998,877,118 raw units") as the engine now does, where it was
  written unbroken.

- **"An unknown amount of".** An amount fixed only when the transaction
  runs reads "an unknown amount of SOL", with the article the engine now
  writes, where it read "unknown amount of SOL".

- **What a transaction does, in the engine's words.** Each line under
  "What this does" is the sentence the SignLens engine words for it, its
  amounts and addresses laid out as before, where the window wrote its
  own; the lines read the same. An effect of a type this version does
  not know is now shown in those words, where the window said it could
  not show it.

- **An update starts the history afresh.** The answers the popup kept,
  and their count on the badge, are forgotten when SignLens updates: an
  earlier version's may be in a shape the new one does not read, and
  some browsers keep them across an update.

- **The explanation from the API's `/v2`.** SignLens asks the SignLens
  API for `/v2/explain`, where the engine says every word as a message:
  its words and the amounts and addresses they name, which the window
  lays out with its own nodes, and words in place of an address or a
  token the engine does not know. It reads that document
  (`signlens-explanation/2`) as strictly as the last, and the window
  reads as it did. An API that does not serve `/v2` yet cannot explain
  for this version, and the window says that it needs an update, or the
  default API in the settings.

- **Your contacts' names stay in your browser.** The address book went to
  the SignLens API names and all, with each transaction, though the
  engine uses a name only to write it into what it says. Now each
  contact's address goes with a random stand-in for its name, new for
  each request, which says nothing of the name, and the extension puts
  the names back in the explanation before the window shows it; it reads
  as before, with the same verdicts and findings. A transaction cannot
  make the window print a contact's name, since it cannot know the
  stand-in, and the stand-ins tie no two requests together. A rating
  reports a summary with each contact in it as "a contact". Firefox no
  longer lists personally identifying information among what SignLens
  collects.

- **Your addresses are a list.** One row each, in full to hold against
  your wallet's, with Remove, and a field that adds one, or several
  pasted at once, and takes nothing that is not a Solana address, saying
  why; before, a box of one address per line. The same list is in the
  popup's settings and on the setup page. While pass-through mode has
  none, the popup's requests ask for one inline.

- **"Continue anyway" asks again.** On a request SignLens would
  refuse, blocked or not explained, one press of "Continue anyway"
  handed it to your wallet. It now asks "Pass this request on anyway?"
  first, with why: the most serious finding, or that nothing is known of
  what the request does. "Go back" is the filled button and has the
  focus, so Enter and Escape leave the request waiting; only the
  question's own "Continue anyway", in the blocked colour, passes it on.

- **Account reads four at a time.** Public RPCs take ten accounts a
  call, so a transaction with more than ten writable accounts, its lookup
  tables and its tokens' decimals each took one round trip per ten. Up to
  four of those calls now go out together: one round trip for up to forty
  accounts, about 60 ms less on such a transaction.

- **At most 8 of your addresses and 64 contacts a request.** The API now
  refuses more, since each costs it work and memory. Past 8, a request
  carries the addresses the page names first, then the first in your
  settings; past 64, the first contacts of the address book. The
  settings say when some go unused.

### Fixed

- **The wallet the window names is the one that signs.** Choosing
  another wallet in the settings while a site was connected left the site
  connected to the one before: the window said "Continue to Backpack" and
  Continue handed the request to Phantom. The site is now disconnected,
  and connects again to the wallet chosen. A request whose site
  disconnected while its window was open says so, rather than that
  SignLens holds no keys.

- **A Reject reads as one to the site.** A request rejected in SignLens
  is refused as wallets refuse one, with code 4001 and "User rejected the
  request in SignLens", so a site tells it from a failure; Kamino, for
  one, looks for those words before it shows an error.

- **Requests past the API's limit.** Once the API refuses a transaction
  of a request for its limit, the ones after it are not asked for: each
  says so, and to ask again in a minute, rather than meeting a refusal of
  its own. A request of more than 32 transactions is refused as such, not
  as a list that is not one.

- **Lookup tables extended since they were read.** A table is kept for
  five minutes once read, and a transaction that used an address added to
  it since could not be read until then. Such a table is now read again.

## [0.2.0] - 2026-10-25

Explanations that read the accounts a transaction names, for multisig
approvals and DAO votes, and the Firefox build ready for
addons.mozilla.org.

### Added

- **Accounts an explanation names.** Approving a multisig proposal made
  in an earlier transaction signs a reference to it; the transaction it
  runs is stored on chain. A Jupiter DAO vote signs a side's number; the
  proposal says which option that is. When an explanation names accounts
  like these that it would read, SignLens reads them from the RPC in the
  settings and asks the API again with them, up to twice, and the window
  lists the accounts read, unverified. What they hold is shown as the
  RPC's claim and never lowers a finding. On by default; "Read the
  accounts an explanation needs" in the settings turns it off. A saved
  transaction carries the accounts read with it.

### Changed

- **Firefox 140 or later.** It is the first Firefox to ask you about the
  data an add-on sends, which addons.mozilla.org requires; an earlier one
  would install SignLens without asking.
- **A rating's version, in Firefox, only once you allow it.** Firefox
  asks, the first time you rate, whether a rating may carry the site and
  SignLens's version, in one question; each goes only once allowed.

## [0.1.0] - 2026-10-24

The first public version: a Wallet Standard wallet without keys that
explains every signing request through the SignLens API and hands it to
the wallet you sign with; a window with the verdict, the effects and the
details; a feedback strip; TypeScript throughout, compiled file for file;
reproducible release packages for Chrome and Firefox. Nothing was released
before it, so everything below is new.

### Added

- **The wallet.** "SignLens" registers as a Wallet Standard wallet in
  every dapp. A dapp has to connect before it can ask for anything, and
  asks one thing at a time per tab. In pass-through mode a request goes on
  to the wallet you sign with (named in the settings, or the first one
  found) only on your decision, or with "Show the explanation and ask
  first" off when SignLens would not refuse it; anything else (no answer,
  a closed or reloaded page, no decision in time) refuses it. A page that
  goes stops the calls made for its request, and one it withdrew before
  anything was shown is not kept. The connection holds when the wallet
  behind SignLens drops its own, as jup.ag makes Backpack do whenever
  another wallet is connected: SignLens takes it up again, silently,
  before handing the wallet the next request, and ends the session only
  if the wallet will not reconnect without asking. In watch-only mode it
  connects as any address, explains, and refuses.
- **What the dapp gets.** The wallet is handed SignLens's own copy of the
  bytes it explained, taken when the dapp asked, whatever the page does
  afterwards (writing into its array, a getter, a replaced built-in). The
  page is told whether the request went on, was rejected by you, or was
  refused by SignLens and why; never the verdict or the explanation, which
  depend on your address book. The channel to the extension is a
  MessageChannel the page cannot reach, through patched built-ins or
  `window.event`.
- **Your addresses.** The explanation calls "you" only addresses you gave
  SignLens: the ones in the settings, or the watched one. A transaction
  whose page names another as the one that signs it is not explained
  until you say whether it is yours, in a window that shows it beside
  yours, Reject first; "It's mine, add it" adds it to the settings. A
  request naming more than one such address is refused, and so is one
  with "Show the explanation and ask first" off, with no window. In
  watch-only mode such a request is refused.
- **Watch-only consent.** A site sees the watched address only once you
  allow it, in a window of its own, once per site and address; a Deny
  holds for that time only, a silent connect never asks, and the settings
  list the sites and revoke them.
- **The explanation.** Lookup tables and a simulation are read over your
  RPC (legacy, v0 and v1 transactions), unlisted tokens are named from the
  RPC and a token list, and the API's answer is checked field by field
  before anything is shown: one that does not hold together, or a verdict
  this version does not know, is an error, and a kind of effect or value
  it does not know is shown as one. An API that did not answer, or
  answered 502, 503 or 530, is asked once more after a short pause (its
  `Retry-After`, at most two seconds) before the request counts as
  unexplained; feedback is sent once. The window shows the verdict and the
  summary first, each transaction of a request under its own heading,
  what each does to you, and the instructions and the full text under
  toggles; its title carries the verdict and the site. In pass-through
  mode, blocked and error requests wait for you even with "Show the
  explanation and ask first" off. No text from the API, the RPC or the page keeps a character that
  hides or reorders what is around it (a right-to-left override, a
  zero-width space): each shows as "?". A zero-width joiner stays only
  between two characters that are not ASCII, as in an emoji sequence or
  Persian and Indic text; beside ASCII it shows too.
- **The popup.** The latest requests, with what became of each and why
  SignLens refused one, the sites that asked to see the watched address,
  and the settings. A connect that found no wallet to pass to is one row
  per site, in SignLens's words, with the wallets the page named quoted.
  The requests keep to about half of the browser's room
  for the session, an answer too large without its full text, and give
  way to a request waiting in a window when the browser runs short. The badge shows the worst verdict not seen yet,
  ranked as the window ranks it.
- **Feedback.** A strip under the explanation sends a rating and a
  comment, once, one record per explained transaction with its digest,
  the site's host (in Firefox only once you allow it: Firefox asks the
  first time you rate, and its add-on manager changes the answer), the
  wallet method, the extension's version and what the window showed (the verdict, the summary, the findings by code and
  the program each instruction calls), and the transaction itself, with
  the addresses its lookup tables loaded, only when you tick the box
  that offers it, under every explanation, OK included. The strip says
  what a rating sends before one is given. The record is the API's
  `signlens-feedback/2`.
- **Endpoints.** The API, the RPC and the token list must be https, or
  plain http to localhost or 127.0.0.1; the worker checks again before
  each call, and the popup says "Not used" of an address that breaks the
  rule. Defaults are not copied into storage, so later defaults reach
  everyone.
- **Accessibility**, aiming at WCAG 2.2 AA; axe-core finds nothing in the
  window, the consent and address windows or the popup, in either theme, and the
  end-to-end suite runs it (`e2e/axe.spec.ts`):
  - every control is a button, tab or field with its own name, its hints
    as its description;
  - focus stays where it was when lists change, and goes somewhere
    sensible when what had it goes;
  - Escape rejects only when nothing nearer is open;
  - text reads at 4.5:1 and a field's edge at 3:1 in both themes, held by
    a test;
  - every window reflows to 320 pixels, and nothing
    cuts off a focus ring; one too short for its header, the
    explanation and the buttons at once (zoomed in) scrolls as one page.
- **Packages and CI.** A Firefox package, declaring the data it sends
  (the site a rating carries as optional, asked for), built and released
  with the Chrome one. CI runs the lint, the types, the
  Node tests (in a random order) and the whole end-to-end suite on every
  change, against the SignLens API's answers recorded under
  `test/fixtures/api/`, and against the live API when one is configured,
  where an answer that no longer holds what was recorded is a warning (a
  release fails on it); in the tests the browser reaches no host but this
  machine. CI also checks that the packages come out the same bytes on
  Linux, macOS and Windows, and a release is published only when they do.
  A release runs every test, the live API included, and carries a build
  provenance attestation.

[Unreleased]: https://github.com/signlens/signlens-extension/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/signlens/signlens-extension/releases/tag/v0.2.0
[0.1.0]: https://github.com/signlens/signlens-extension/releases/tag/v0.1.0
