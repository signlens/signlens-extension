# Developing SignLens for the browser

How to build, test and find your way around the extension. Using it is in
the [README](README.md); how to contribute, in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Building

Node 26.1 or later (`npm test` runs the files in a random order, which
Node 26 takes from 26.1). `nvm use` picks it from `.nvmrc`, and `npm ci`
refuses an older Node (`.npmrc`).

`npm install && npm run build` makes `dist/chrome/`, which a Chromium
browser loads unpacked as the README's [Install](README.md#install) says,
and `npm run build:firefox` makes `dist/firefox/`, whose `manifest.json`
Firefox loads as a temporary add-on. `npm run package` builds both
packages, as a release has them.

## Building for review

A store's reviewer rebuilds a package from its source and compares the
two. Every package rebuilds to the same bytes, with open-source tools
only, on Linux, macOS or Windows, x64 or ARM64 (CI builds it on Ubuntu,
on macOS on Apple silicon and on Windows, and compares).

1. Any of those; for example Ubuntu 24.04.
2. Node 26.1 or later, with the npm that comes with it. Not Node 24:
   `npm ci` refuses an older Node (`.npmrc` sets `engine-strict`). With
   [nvm](https://github.com/nvm-sh/nvm): `nvm install 26 && nvm use 26`,
   the version `.nvmrc` names.
3. In the source's directory, a release's tag or its source archive,
   which needs no git:

   ```sh
   npm ci
   npm run package
   ```

4. `dist/signlens-extension-firefox-X.Y.Z.zip` is the Firefox package,
   byte for byte, and `dist/signlens-extension-X.Y.Z.zip` the Chrome one:
   `sha256sum dist/*.zip` prints the SHA-256s the release publishes. The
   files inside are `dist/chrome/`, with the Firefox manifest in the
   Firefox package.

`npm ci` installs exactly what `package-lock.json` pins. `npm run
package` runs `scripts/copy-static.ts` (copies `static/` into
`dist/chrome/`), the TypeScript 7 compiler (`tsc -p
tsconfig.build.json`: one JavaScript file for each source file under
`src/`, neither bundled nor minified, so each reads as its source does
without the types), and `scripts/package.ts`, which writes both zips:
sorted entries, stored uncompressed, fixed timestamps, and for Firefox
the manifest `scripts/firefox-manifest.ts` derives from
`static/manifest.json`.

## Tests and tools

```sh
npm install
npm run check           # Biome (lint and format, the stylesheet included) and the TypeScript compiler, strict
npm test                # in Node: every module but the pages, the worker's against the stub RPC and a fake chrome; in a random order, seed printed
npm run build           # dist/chrome: the files in static/, and tsc's script for each source, one file each
npm run test:e2e        # the extension in Chromium, against the API's recorded answers
npm run test:e2e:record # the same against a running SignLens API, recording its answers anew
npm run screenshots     # the README's images, of the real window and popup on recorded explanations
npm run icons           # the icons and the wallet icon, from docs/design/icon.svg
npm run messages        # src/shared/catalog.ts: the interface's words, compiled from locales/*/*.ftl
npm run package         # the Chrome and Firefox packages under dist/, with their SHA-256s
```

The end-to-end tests load the unpacked extension into Chromium, serve a
test dapp and a stub RPC on localhost, and answer the API calls with what a
running SignLens API answered them, recorded under `test/fixtures/api/` (one
file per call: its method, path and body), counting them and refusing them
when a test asks. A call nothing was recorded for fails its test, and the
browser resolves no host but this machine, so the suite needs no network.
The browser reads `en-US`, so numbers and times are as the tests read
them; a spec for a reader of another language sets its own
(`test.use({ browserLocale: 'zh-CN' })`, `e2e/chinese.spec.ts`), and
skips when the API it talks to carries no pack for it.
With `SIGNLENS_API_URL` set, the calls go to that API instead, and each
answer is held against its recording: every value recorded must still be
there, the same (a field the API added, or a newer token snapshot, is
not a change). One that departs is reported at the end of the run, as a
warning (in GitHub Actions, an annotation and a line on the run's
summary page); with
`SIGNLENS_STRICT_RECORDINGS=1`, as a release runs, it fails its test.
The API limits explanations per address, and a run comes from one: a
call it refuses with `429` is answered from its recording and named in a
note at the end, as checked against nothing, never as drift, strict or
not, and never recorded. Feedback is never sent, live or not.
`npm run test:e2e:record` runs the suite that way and records every answer
anew (`SIGNLENS_API_URL`, default `http://127.0.0.1:8787`). The API must
serve `/v2/explain`, whose explanation is `signlens-explanation/2`, every
word the engine says a message (the engine's `docs/explanation-schema.md`);
an API from before it answers 404, and the suite fails. The fixtures
under `test/fixtures` are mainnet transactions and what the API made of
them: each `*.explanation.json` is the `/v2` answer to the request that
made it.

On every change CI runs the lint, the types, the Node tests and the
end-to-end suite, and builds the package on Linux, macOS and Windows,
which must come out the same bytes. When the repository variable
`SIGNLENS_API_URL` names an API, the suite also runs against it; a
release requires that.

## The interface's words

The extension's own words are Fluent messages, as the engine's are
(ADR-0015, phase 5): English in `locales/en/*.ftl`, the source, and a
translation under the same identifiers in `locales/<locale>/`. `npm run
messages` compiles them into `src/shared/catalog.ts`, which is committed:
each message's pattern, and the types of its arguments, so that a script
asking for a message that is not there, or with the wrong arguments, does
not compile. A translation may use no argument, attribute or named link
its English lacks. `npm test` fails when the catalog is out of date, when
a page names a message English does not have, and when an English message
is asked for nowhere.

The extension's name and description are messages too (`manifest.ftl`):
`static/manifest.json` names them (`__MSG_name__`), and `npm run
messages` writes them to `static/_locales/<locale>/messages.json`, where
the browser takes them in its own language (zh_CN for zh-Hans).

A page marks an element with `data-l10n-id`, and the message words its
content and the attributes it has (`.title`, `.aria-label`,
`.placeholder`, `.alt`); a script asks with `t(id, args)` for text and
`nodes(id, args)` for words with markup. The markup a message may carry
is a few inline elements (`<strong>`, `<em>`, `<code>`, `<kbd>`) and a
link the page holds by `data-l10n-name`; it is laid out with DOM calls,
never parsed as HTML. A number argument is written as the locale writes
numbers, and a choice by a number takes its plural category.

The interface's locale is the reader's first language it has
(`navigator.languages`), as the engine chooses an explanation's: by the
tag, else by the language in the same script (zh-CN takes zh-Hans; zh-TW
goes on to the next language); a pseudo-locale only by its own tag;
English when none matches, and always in Node, so that the tests read
English. A locale with no message yet is not offered. A page carries
the interface's `lang`; the engine's words in an explanation carry the
explanation's.

The catalog also holds `en-XA`, a pseudo-locale made from the English as
the engine's is (ADR-0015, decision 11): every message accented,
bracketed and about 40% longer, its arguments and markup as they are.
`e2e/pseudo.spec.ts` opens every page in it, in the states `axe.spec.ts`
checks, and fails on any visible text or worded attribute that is plain
English: the interface's words left in code. Data (addresses, sites,
names, numbers, times) and the engine's words, which carry the
explanation's language, are not the interface's.

Each language has a style note and term list, `locales/<locale>.md`
(`zh-Hans.md`), which its draft and its review follow. A Chinese
translation is held to it: a space between Chinese and Latin letters or
digits, none beside full-width punctuation, full-width punctuation against
Chinese, no full-width brackets inside them, and no English but the words
its "Kept in English" lists (a translation that is its English, a name,
aside). Where a message's words meet an argument, the formatter sets the
space itself, as the engine does.

A translation is reviewed as the engine's are (its `docs/translating.md`),
from a spreadsheet, in two passes: what the signing window shows first,
then the rest.

```sh
node scripts/review.ts sheet zh-Hans --pass critical [--extra back.tsv]   # window.ftl, verdict.ftl, worker.ftl
node scripts/review.ts sheet zh-Hans --pass rest
node scripts/review.ts apply zh-Hans zh-Hans-critical.csv                  # the reviewer's corrections, into locales/zh-Hans/
node scripts/review.ts record zh-Hans --by "a native speaker" --on 2026-11-01
```

A sheet has a row per distinct English and translation, with the
identifiers that share them, the English's comment, and, from `--extra`
(a TSV of id, back-translation, example), a back-translation made without
the English and where the message shows. The reviewer marks each row in
`verdict` and writes a corrected translation, as Fluent, in `correction`.
`record` writes `locales/<locale>.review.json`: who reviewed it, by role,
never by name, when, and a digest of each translated message's English as
it was reviewed.

A translation reaches the catalog only once it is reviewed, its English
unchanged since: a draft, or one whose English changed (stale), is left
out, and the English shows in its place. `npm run messages` says how much
of each language is reviewed; `node scripts/messages.ts --check` says the
same and what is wrong, writing nothing; `node scripts/messages.ts --dev`
writes a
catalog with the drafts, to try them, never to commit. A release ships no
language with any of its interface in English: the release workflow runs
`node scripts/messages.ts --complete`, which fails unless every English
message is reviewed and current in every language. CI lists it, and does
not fail on it.

## Layout

`src/` is split by where the code runs, since each place has its own
browser APIs and rules. Each module's Node test sits beside it.

| | |
|---|---|
| `src/page/` | runs in the dapp's page, as classic scripts that import nothing |
| | `injected.ts`: the Wallet Standard wallet in the page, its copy of the request, and the hand-off to the real one |
| | `content.ts`: relays between the page and the extension |
| | `page.d.ts`: the types those two share with the modules, which they cannot import |
| `src/worker/` | the background service worker |
| | `background.ts`, `alive.ts`: keeps the wallets each page has and routes the messages; stays up while it holds a request |
| | `requests.ts`: a page's request answered: explained, shown, decided on, kept |
| | `explain.ts`, `tables.ts`, `simulation.ts`, `hints.ts`, `contacts.ts`: what a request is explained with: the lookup tables and the simulation over your RPC, names for unlisted tokens, the address book with stand-ins for its names, and the API's answer as rows, the names put back |
| | `api.ts`, `explanation.ts`: the API client, and the explanation document as this version reads it, checked field by field or refused with where it fails |
| | `gate.ts`, `history.ts`: the window and the user's decision; the popup's history and the badge |
| | `sites.ts`: in watch-only mode, the sites allowed to see the watched address, and the window that asks |
| | `feedback.ts`: the feedback records |
| | `welcome.ts`: which installs open the setup page |
| | `solana.ts`: the little of Solana's wire format the worker needs |
| `src/ui/` | the extension's own pages |
| | `popup.ts`, `pages.ts`: the popup; the pages SignLens runs on, and what the popup says over one it does not |
| | `confirm.ts`, `connect.ts`, `address.ts`, `wallet.ts`, `windows.ts`, `dom.ts`: the window, the window that asks to show a site the watched address, the one that asks whether an address is yours, the one that asks which wallet signs, and what they share |
| | `render.ts`: one row of a request as the window and the popup show it |
| | `localize.ts`: a page's elements worded by `data-l10n-id`, and a message's markup laid out as elements |
| | `welcome.ts`, `access.ts`, `yours.ts`: the setup page a new install opens; the access to sites the settings need, which the popup and the setup page ask for; your addresses as a list, in both |
| `src/shared/` | what the worker and the pages both use, and nothing of either |
| | `types.ts`: the contract: the explanation document, the request, the feedback record, the API's status |
| | `programs.ts`: the program each instruction of a transaction calls, which a report says, read from its bytes |
| | `model.ts`: what SignLens keeps of a request: its rows (explained, failed, a message, a site asking, an address not yours) and what became of it |
| | `messages.ts`: the messages and who may send what |
| | `store.ts`: the extension's storage, typed by key, and the queue its read-then-write changes go through |
| | `settings.ts`, `endpoint.ts`: the settings and their defaults; the endpoints accepted, checked again at each use |
| | `consent.ts`: in Firefox, the user's say on whether a rating carries the site |
| | `verdict.ts`: the verdict words and which is worst, for the badge and the window |
| | `fluent.ts`, `words.ts`, `catalog.ts`: a message worded for a locale; the interface's words in its locale, else in English; the messages, compiled from `locales/` (generated) |
| | `text.ts`, `json.ts`, `base58.ts`: text from elsewhere made safe to show; objects read from elsewhere; addresses |
| `src/manifest.test.ts`, `src/layout.test.ts`, `src/icons.test.ts`, `src/release-notes.test.ts` | the manifest, the Firefox manifest, and the host permissions against the endpoint rule; the folders, and what each may import; the icons against their one drawing; a release's notes against the changelog |
| `locales/` | the interface's words, a folder of Fluent files per locale, English the source |
| `static/` | the manifest, the pages, the stylesheet and the icons, copied as they are into the build |
| `docs/design/` | the icon's one drawing, from which `npm run icons` makes the four PNGs (the 128 px one padded as the Chrome Web Store asks) and the wallet icon a dapp shows |
| `docs/images/` | the README's screenshots, in the light and the dark theme, made by `npm run screenshots` (`e2e/screenshots.shot.ts`) |
| `dist/` | what the build makes, never committed: `chrome/` (the unpacked extension, the scripts in the folders they have under `src/`), `firefox/`, and the packages |
| `scripts/` | the interface's words compiled into the catalog, the Firefox copy, the reproducible packages, a release's notes from the changelog, and recording the API's answers for the end-to-end tests |
| `e2e/` | the end-to-end tests, in Chromium, and the harness that loads the extension and opens its windows; at the end of a run against a live API, which recordings it no longer matches |
| `test/` | what the Node tests and the end-to-end tests share: the mainnet transactions and the API's recorded answers (`fixtures/`), the stub RPC and API relay, the test dapp it serves, and the stand-in for the `chrome` APIs the modules run against in Node |
