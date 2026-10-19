# Contributing

Issues and pull requests are welcome. A few things keep the project easy to
review:

- **One change per pull request**, with the tests that show it. The
  end-to-end suite needs a running SignLens API; the Node tests and the
  type check run anywhere.
- **`npm run check` must pass**: Biome for lint and format, and the
  TypeScript compiler in strict mode. `npm run format` fixes what it can.
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
