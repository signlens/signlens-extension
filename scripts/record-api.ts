// `npm run test:e2e:record`: runs the end-to-end suite against a running
// SignLens API (`SIGNLENS_API_URL`, by default http://127.0.0.1:8787) and
// keeps every answer it gives under test/fixtures/api/, replacing what was
// there, so that the suite replays them without an API. The whole suite,
// always: a recording no test asks for any more goes with the old ones.

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { RECORDINGS } from '../test/server.ts';

const api = process.env.SIGNLENS_API_URL ?? 'http://127.0.0.1:8787';
try {
    await fetch(`${api.replace(/\/+$/, '')}/v1/packs`, { signal: AbortSignal.timeout(5_000) });
} catch (error) {
    console.error(`no SignLens API answers at ${api} (${error instanceof Error ? error.message : String(error)}); set SIGNLENS_API_URL`);
    process.exit(1);
}
rmSync(RECORDINGS, { recursive: true, force: true });
const run = spawnSync('npx', ['playwright', 'test'], {
    stdio: 'inherit',
    // npx is a script on Windows, which only a shell runs.
    shell: process.platform === 'win32',
    env: { ...process.env, SIGNLENS_API_URL: api, SIGNLENS_RECORD: '1' },
});
process.exit(run.status ?? 1);
