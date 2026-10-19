# Contributing

Issues and pull requests are welcome. A few things keep the project easy to
review:

- **One change per pull request**, with the tests that show it. Every
  test runs anywhere: the end-to-end suite answers the API's calls from
  `e2e/fixtures/api/`. A change that makes the extension ask the API
  something new needs those answers recorded: run
  `npm run test:e2e:record` against a SignLens API and commit what changes
  under `e2e/fixtures/api/` with the change.
- **`npm run check` must pass**: Biome for lint and format (the
  TypeScript and the stylesheet), and the TypeScript compiler in strict
  mode. `npm run format` fixes what it can.
- **No new dependencies without a reason** in the pull request. The
  extension ships no third-party code; its only dependencies are
  development tools.
- **Sign off your commits** (`git commit -s`), which states that you have
  the right to contribute the change under the project's license
  ([Developer Certificate of Origin](https://developercertificate.org)).
- **Security findings** go to the address in [`SECURITY.md`](SECURITY.md),
  not to the issue tracker.

The wallet in the page (`src/injected.ts`) and the content script
(`src/content.ts`) are classic scripts with no imports, on purpose: they
run in the page's world and must stay self-contained. Everything else is
ES modules.

The worker is small modules with `src/background.ts` wiring them to the
browser. A module that needs only `fetch` is tested in Node against the
end-to-end tests' stub RPC and the API's recorded answers
(`e2e/fixtures/*.explanation.json`); one that needs `chrome` is tested
against `src/chrome.fake.ts`. A `*.fake.ts` file is a test's stand-in and
is never built into the extension.

The wallet in the page shares its world with the page, which can replace
any built-in. It touches the port and the bytes of a request only through
what it took at start-up (see `snapshot` in `src/injected.ts`), so that
what is passed on is what was explained; keep it that way, and add a case
to `src/injected.test.ts` for anything new it reads from the page.
