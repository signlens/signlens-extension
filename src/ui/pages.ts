// The pages SignLens runs on, as the manifest's content scripts match them
// (pages.test.ts holds the two together), and what the popup says over a
// tab where it finds no other wallet to pass requests to.

/** Whether SignLens's scripts run on a page at `url`: https, or plain http on this machine. */
export function runsOn(url: string | undefined): boolean {
    return /^(https:\/\/[^/]|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/.test(url ?? '');
}

/**
 * Why the popup lists no other wallet for the tab at `url`, which a
 * browser gives only for pages the extension may reach: the page is not
 * one SignLens runs on, its tab was open from before SignLens was
 * installed or updated (`running` false: nothing answered), or the page
 * has no other wallet.
 */
export function noWalletHint(url: string | undefined, running: boolean): string {
    if (!runsOn(url)) return 'SignLens does not run on this page. Open a dapp (an https page), then open this popup again.';
    if (!running) {
        return 'SignLens is not running in this tab yet. Reload the tab (needed once after installing or updating SignLens), then open this popup again.';
    }
    return 'No other wallet found in this tab. Open a dapp, then come back here.';
}
