// The pages SignLens runs on, as the manifest's content scripts match them
// (pages.test.ts holds the two together), what the popup says over a tab
// where it finds no other wallet to pass requests to, and which languages
// the API explains in.

import type { Row } from '../shared/model.ts';
import type { ApiStatus } from '../shared/types.ts';
import { interfaceLocale, t } from '../shared/words.ts';

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
    if (!runsOn(url)) return t('popup-no-wallet-elsewhere');
    if (!running) return t('popup-no-wallet-reload');
    return t('popup-no-wallet-page');
}

/**
 * The languages explanations come in: English, and each the API carries
 * with the day it was reviewed, naming no reviewer, the one used being
 * the first of the browser's languages the engine has (ADR-0015,
 * decision 10).
 */
export function languages(locales: ApiStatus['locales'], names = languageNames()): string {
    const each = locales.map(({ locale, review }) => {
        const name = names(locale);
        return t('popup-language', {
            language: name === locale ? locale : t('popup-language-named', { name, tag: locale }),
            review: review.kind,
            on: review.kind === 'reviewed' ? review.on : '',
        });
    });
    return t('popup-languages', { count: locales.length, languages: each.join(t('popup-languages-separator')) });
}

/** A locale's name in the browser's language, or the tag where the browser has none. */
function languageNames(): (tag: string) => string {
    try {
        const names = new Intl.DisplayNames([interfaceLocale()], { type: 'language' });
        return (tag) => names.of(tag) ?? tag;
    } catch {
        return (tag) => tag;
    }
}

/**
 * What the window offers about the explanation's language (phase 4, D6):
 * English, for one worded in another language, so that a doubted
 * translation can be read against the source; the reader's own, for one
 * asked for in English alone ("Show in English") when the browser's first
 * language is another; else nothing.
 */
export function languageChoice(rows: readonly Row[], browser: readonly string[]): 'english' | 'reader' | null {
    const worded = rows.flatMap((row) => (row.kind === 'explained' && row.locale ? [row.locale] : []));
    if (worded.some((locale) => locale.used !== 'en')) return 'english';
    const inEnglish = worded.length > 0 && worded.every((locale) => locale.asked.length === 1 && locale.asked[0] === 'en');
    const first = browser[0] ?? 'en';
    return inEnglish && !/^en(-|$)/i.test(first) ? 'reader' : null;
}
