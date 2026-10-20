// The README's screenshots (`npm run screenshots`): the end-to-end harness
// run on e2e/*.shot.ts alone, so that the suite never writes images.

import { defineConfig } from '@playwright/test';
import suite from './playwright.config.ts';

export default defineConfig({ ...suite, testMatch: '*.shot.ts', retries: 0 });
