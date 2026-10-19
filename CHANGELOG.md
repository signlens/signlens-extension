# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

The first public version: a Wallet Standard wallet without keys that
explains every signing request through the SignLens API and hands it to
the wallet you sign with; a window with the verdict, the effects and the
details; a feedback strip; TypeScript throughout, compiled file for file;
reproducible release packages for Chrome and Firefox. The page-to-extension
channel is a MessageChannel the page cannot reach, and a request goes on
only on the user's decision or when the window is off, never on silence.

### Security

- The wallet is handed SignLens's own copy of the bytes it explained. A
  page could change its transaction between the explanation and the
  wallet (writing into its array, a getter, a replaced built-in) and have
  SignLens vouch for one transaction while the wallet signed another.
- The page is no longer told the verdict. It depends on the address book,
  so lookalike transfers could probe for who the user knows.
- A request goes on only on a decision to continue, or with the window
  off; an answer without a decision is a refusal.
- A dapp has to connect before it can ask to sign, and one request per
  tab is open at a time, so a page cannot stack up windows or calls to
  the RPC and the API.
- Patching built-ins no longer hands the page the port to the extension.
- Endpoints must be https, or plain http to this machine only. Upgrading:
  an address kept from before in plain http to another machine (a LAN
  host, say) is no longer used, and every request explained through it
  would fail; the popup flags it as "Not used". Serve it over https, or
  reach it through localhost.
- With the window off, in pass-through mode, a request SignLens would
  refuse (blocked, or not explained) still opens the window and waits
  for the user; before, it went on to the wallet with only the badge to
  say so.
- In watch mode a site sees the watched address only once the user allows
  it, in a window of its own, once per site and address; a silent connect
  never asks, and the settings list the sites and revoke them. The address
  was given to any site that connected, and sent to every page's wallet
  script, watch mode or not.

### Fixed

- The explanation document is checked field by field before anything is
  shown: one that does not hold together is an error that says where it
  fails, a kind of effect, value or section this version does not know is
  shown as one, and sizes and decimals are bounded. The renderer and the
  worker no longer cast the document, and a label such as `constructor`
  no longer finds `Object.prototype` in the renderer's tables.
- A verdict this version does not know, or an API error without a
  message, is an error in the window, not a neutral message with
  Continue first.
- The badge and the window rank verdicts the same way.
- A "clear" rating is sent once; each feedback record carries its own
  transaction's digest; "send this so it gets covered" sends only the
  transactions SignLens did not call OK.
- Closing the dapp's page, or the page giving up, refuses the request and
  closes its window; a Continue that reaches no waiting request says so.
- A transaction a page names as for another chain than mainnet is said
  to be in the window; it is read and simulated on the RPC in the
  settings all the same, since the name is only the page's word.
- A failed second explanation (with token names) keeps the first.
- Accessibility: the toggles, the help terms and "show all bytes" are
  buttons that say whether they are open; the popup's views are tabs the
  arrow keys move between; the feedback ratings say which is chosen, the
  comment box has a name, and what the window says after is announced;
  a settings field that is refused says so and why; the window's headings
  follow each other; the popup has a main landmark; the choices in the
  settings are far enough apart to hit. axe-core now finds nothing on the
  window or the popup; before, five of its rules failed.
- Contrast: in the light theme, links and focus rings use an amber that
  reads as small text (5.4:1, was 4.0:1); in the dark theme the feedback
  strip's note and line use the theme's colours (7.0:1, was 3.0:1).
- An endpoint that is not taken is not saved, and the field says why once
  it is left; a default is no longer copied into storage, so later
  defaults reach everyone.

### Added

- A Firefox package, declaring the data it sends, built and released with
  the Chrome one.
- CI runs the whole end-to-end suite on every change, against the
  SignLens API's answers recorded under `e2e/fixtures/api/`, and against
  the live API when one is configured, where an answer that differs from
  its recording fails the run; in the tests the browser reaches
  no host but this machine. CI also checks that the packages come out the
  same bytes on Linux, macOS and Windows. A release runs every test, the
  live API included, and carries a build provenance attestation.
