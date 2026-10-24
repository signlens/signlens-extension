// The recordings a live API no longer matches (`drift` in server.ts), and
// the calls its rate limit refused, gathered while the suite runs and said
// once at its end. Drift is said as warnings, and on a GitHub Actions run
// as annotations and on its summary page. An API that changed what the
// recordings hold is worth recording anew, not a reason to fail a change
// to the extension, whose own tests passed against it; with
// SIGNLENS_STRICT_RECORDINGS=1, as a release has it, each test it happened
// in fails instead. A refused call is said as a note, and fails nothing.
//
// Playwright runs the default export first (globalSetup in
// playwright.config.ts), and what it returns last.

import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

/** Whether drift fails the test it happened in. */
export const STRICT = process.env.SIGNLENS_STRICT_RECORDINGS === '1';

const DIRECTORY = new URL('../../test-results/', import.meta.url);
const FILE = new URL('api-drift.txt', DIRECTORY);
const LIMITED = new URL('api-limited.txt', DIRECTORY);

/** Keeps `lines` for the end of the run. */
export function noteDrift(lines: string[]): void {
    mkdirSync(DIRECTORY, { recursive: true });
    appendFileSync(FILE, lines.map((line) => `${line}\n`).join(''));
}

/** Keeps the calls the rate limit refused, answered from their recordings, for the end of the run: never a failure, strict or not. */
export function noteLimited(lines: string[]): void {
    mkdirSync(DIRECTORY, { recursive: true });
    appendFileSync(LIMITED, lines.map((line) => `${line}\n`).join(''));
}

/** The lines kept in `file`, once each, a test retried included. */
function kept(file: URL): string[] {
    try {
        return [...new Set(readFileSync(file, 'utf8').split('\n').filter(Boolean))];
    } catch {
        return [];
    }
}

/** Says how many calls the rate limit refused, which were then checked against nothing. */
function reportLimited(): void {
    const limited = kept(LIMITED);
    if (limited.length === 0) return;
    const many = limited.length === 1 ? 'call' : 'calls';
    const note = `the SignLens API's rate limit refused ${limited.length} ${many}, answered from the recordings and so checked against nothing: ${limited.join('; ')}`;
    console.log(process.env.GITHUB_ACTIONS ? `\n::notice title=SignLens API rate limit::${note}` : `\nnote: ${note}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, `### SignLens API rate limit\n\n${note}\n`);
}

/** Says what drifted, once each, a test retried included. */
function report(): void {
    reportLimited();
    const lines = kept(FILE);
    if (lines.length === 0) return;
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
    rmSync(LIMITED, { force: true });
    return report;
}
