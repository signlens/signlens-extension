// Firefox's consent for what a rating carries beyond the explanation it
// rates. Mozilla counts the site a user was on as browsing activity, and
// the add-on's version as technical data, both of which an add-on may send
// only with the user's say: the Firefox build declares them as optional
// data (scripts/firefox-manifest.ts), Firefox asks once, from the click
// that rates, and a rating carries each only once the user allowed it. The
// Firefox build needs Firefox 140, the first to ask. The Chrome build
// declares nothing: its store listing says what a rating sends, and a
// rating carries both.

import { local } from './store.ts';

/** Mozilla's name for the site a user was on. */
export const SITE_DATA = 'browsingActivity';
/** Mozilla's name for the add-on's version, among other technical data. */
export const VERSION_DATA = 'technicalAndInteraction';

interface DataCollection {
    browser_specific_settings?: { gecko?: { data_collection_permissions?: { optional?: unknown } } };
}

/** Whether this build asks before a rating carries the site and the version: Firefox's, whose manifest lists them as optional data. */
export function asksBeforeRating(manifest: unknown = globalThis.chrome?.runtime?.getManifest?.()): boolean {
    const optional = (manifest as DataCollection | undefined)?.browser_specific_settings?.gecko?.data_collection_permissions?.optional;
    return Array.isArray(optional) && optional.includes(SITE_DATA) && optional.includes(VERSION_DATA);
}

/** What a rating may carry: both always where nothing is asked, and in Firefox each once the user allowed it. */
export async function ratingAllowed(): Promise<{ site: boolean; version: boolean }> {
    if (!asksBeforeRating()) return { site: true, version: true };
    try {
        const granted = (await chrome.permissions.getAll()) as { data_collection?: unknown };
        const given = Array.isArray(granted.data_collection) ? granted.data_collection : [];
        return { site: given.includes(SITE_DATA), version: given.includes(VERSION_DATA) };
    } catch {
        return { site: false, version: false };
    }
}

/**
 * Asks Firefox whether ratings may carry the site and the version, in one
 * question, and resolves once the user has answered; at once where nothing
 * is asked, or it was asked before, since Firefox's add-on manager changes
 * the answer from then on. Called from the click that rates, before
 * anything is awaited: Firefox asks only from a user's action.
 */
export function askBeforeRating(askedBefore: boolean): Promise<unknown> {
    if (askedBefore || !asksBeforeRating()) return Promise.resolve();
    const request = chrome.permissions.request as unknown as (permissions: { data_collection: string[] }) => Promise<boolean>;
    const answered = request({ data_collection: [SITE_DATA, VERSION_DATA] }).catch(() => false);
    local.set({ ratingAsked: true }).catch(() => {});
    return answered;
}
