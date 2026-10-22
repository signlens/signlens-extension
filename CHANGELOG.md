# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
  it does not know is shown as one. The window shows the verdict and the
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
  comment, once, one record per explained transaction with its digest, the
  site's host, the wallet method, the extension's version and what the
  window showed (the verdict, the summary, the findings by code and the
  program each instruction calls), and the transaction itself, with the
  addresses its lookup tables loaded, only when you ask for it to be
  covered, on one SignLens did not call OK. The strip says what a rating
  sends before one is given. The record is the API's
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
- **Packages and CI.** A Firefox package, declaring the data it sends,
  built and released with the Chrome one. CI runs the lint, the types, the
  Node tests (in a random order) and the whole end-to-end suite on every
  change, against the SignLens API's answers recorded under
  `test/fixtures/api/`, and against the live API when one is configured,
  where an answer that no longer holds what was recorded is a warning (a
  release fails on it); in the tests the browser reaches no host but this
  machine. CI also checks that the packages come out the same bytes on
  Linux, macOS and Windows, and a release is published only when they do.
  A release runs every test, the live API included, and carries a build
  provenance attestation.
