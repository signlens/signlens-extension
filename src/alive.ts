// The worker stays up while it holds a page's request. Chrome stops a
// worker after 30 seconds without extension events or API calls, one
// still waiting on the RPC or the API included, and every request it held
// goes with it: the page hears nothing back and refuses. A call to an
// extension API counts, so one is made every 20 seconds for as long as
// any request is held. Firefox runs the worker as an event page and stops
// it the same way; the same call keeps it up there (Firefox 158: a
// 45-second decision and a 36-second explanation reach the wallet with
// it, and are refused without it).

const INTERVAL_MS = 20_000;

let held = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** Runs `work`, with the worker kept up until it settles. */
export async function keepingAlive<T>(work: () => Promise<T>): Promise<T> {
    held += 1;
    timer ??= setInterval(() => {
        chrome.runtime.getPlatformInfo().catch(() => {});
    }, INTERVAL_MS);
    try {
        return await work();
    } finally {
        held -= 1;
        if (held === 0) {
            clearInterval(timer);
            timer = undefined;
        }
    }
}
