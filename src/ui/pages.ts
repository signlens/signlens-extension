// The pages SignLens runs on, as the manifest's content scripts match them
// (pages.test.ts holds the two together), what the popup says over a tab
// where it finds no other wallet to pass requests to, and which languages
// the API explains in.

import type { ApiStatus } from '../shared/types.ts';

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

/**
 * The languages explanations come in: English, and each the API carries
 * with the day it was reviewed, naming no reviewer, the one used being
 * the first of the browser's languages the engine has (ADR-0015,
 * decision 10).
 */
export function languages(locales: ApiStatus['locales'], names = languageNames()): string {
    if (locales.length === 0) return 'Explains in English.';
    const each = locales.map(({ locale, review }) => {
        const name = names(locale);
        const state = review.kind === 'reviewed' ? `reviewed on ${review.on}` : 'not reviewed';
        return `${name === locale ? locale : `${name} (${locale})`}, ${state}`;
    });
    return `Explains in English, and in ${each.join('; ')}, when your browser asks for it.`;
}

/** A locale's name in the browser's language, or the tag where the browser has none. */
function languageNames(): (tag: string) => string {
    try {
        const names = new Intl.DisplayNames([navigator.language], { type: 'language' });
        return (tag) => names.of(tag) ?? tag;
    } catch {
        return (tag) => tag;
    }
}
