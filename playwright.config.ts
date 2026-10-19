// End-to-end tests of the extension in Chromium: the unpacked extension is
// loaded into a persistent context (see e2e/extension.ts), so the tests
// run one at a time in one browser.

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    testMatch: '*.spec.ts',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI ? [['list'], ['github']] : 'list',
    use: {
        trace: 'retain-on-failure',
    },
});
