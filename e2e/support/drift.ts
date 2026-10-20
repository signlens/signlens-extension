// The recordings a live API no longer matches (`drift` in server.ts),
// gathered while the suite runs and said once at its end: as warnings, and
// on a GitHub Actions run as annotations and on its summary page. An API
// that changed what the recordings hold is worth recording anew, not a
// reason to fail a change to the extension, whose own tests passed against
// it; with SIGNLENS_STRICT_RECORDINGS=1, as a release has it, each test it
// happened in fails instead.
//
// Playwright runs the default export first (globalSetup in
// playwright.config.ts), and what it returns last.

import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

/** Whether drift fails the test it happened in. */
export const STRICT = process.env.SIGNLENS_STRICT_RECORDINGS === '1';

const DIRECTORY = new URL('../../test-results/', import.meta.url);
const FILE = new URL('api-drift.txt', DIRECTORY);

/** Keeps `lines` for the end of the run. */
export function noteDrift(lines: string[]): void {
    mkdirSync(DIRECTORY, { recursive: true });
    appendFileSync(FILE, lines.map((line) => `${line}\n`).join(''));
}

/** Says what drifted, once each, a test retried included. */
function report(): void {
    let lines: string[];
    try {
        lines = [...new Set(readFileSync(FILE, 'utf8').split('\n').filter(Boolean))];
    } catch {
        return;
    }
    const say = process.env.GITHUB_ACTIONS
        ? (line: string) => `::warning title=SignLens API drift::${line}`
        : (line: string) => `warning: the SignLens API ${line}`;
    // On a line of its own, whatever the reporter left on the last: GitHub reads a command only at a line's start.
    console.log(`\n${lines.map(say).join('\n')}`);
    const advice = `${lines.length} recorded answer${lines.length === 1 ? '' : 's'} no longer held. If the API is right, record anew with \`npm run test:e2e:record\`; SIGNLENS_STRICT_RECORDINGS=1 fails the run on this.`;
    console.log(advice);
    // A green run's annotations are easy to miss: the run's summary page says it too.
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
        appendFileSync(summary, `### SignLens API drift\n\n${lines.map((line) => `- ${line}`).join('\n')}\n\n${advice}\n`);
    }
}

export default function setup(): () => void {
    rmSync(FILE, { force: true });
    return report;
}
