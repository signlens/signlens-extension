// Firefox's consent for a rating to carry the site. Mozilla counts the site
// a user was on as browsing activity, which an add-on may send only with
// the user's say: the Firefox build declares it as optional data
// (scripts/firefox-manifest.ts), Firefox asks once, from the click that
// rates, and a rating carries the site only once the user allowed it.
// Firefox before 140, which has no such question, and a user who said no
// send ratings without it. The Chrome build declares nothing: its store
// listing says what a rating sends, and a rating carries the site.

import { local } from './store.ts';

/** Mozilla's name for the site a user was on. */
export const SITE_DATA = 'browsingActivity';

interface DataCollection {
    browser_specific_settings?: { gecko?: { data_collection_permissions?: { optional?: unknown } } };
}

/** Whether this build asks before a rating carries the site: Firefox's, whose manifest lists it as optional data. */
export function asksForSite(manifest: unknown = globalThis.chrome?.runtime?.getManifest?.()): boolean {
    const optional = (manifest as DataCollection | undefined)?.browser_specific_settings?.gecko?.data_collection_permissions?.optional;
    return Array.isArray(optional) && optional.includes(SITE_DATA);
}

/** Whether a rating may carry the site: always where nothing is asked, and in Firefox once the user allowed it. */
export async function siteAllowed(): Promise<boolean> {
    if (!asksForSite()) return true;
    try {
        const granted = (await chrome.permissions.getAll()) as { data_collection?: unknown };
        return Array.isArray(granted.data_collection) && granted.data_collection.includes(SITE_DATA);
    } catch {
        return false;
    }
}

/**
 * Asks Firefox whether ratings may carry the site, and resolves once the
 * user has answered; at once where nothing is asked, or it was asked
 * before, since Firefox's add-on manager changes the answer from then on.
 * Called from the click that rates, before anything is awaited: Firefox
 * asks only from a user's action.
 */
export function askForSite(askedBefore: boolean): Promise<unknown> {
    if (askedBefore || !asksForSite()) return Promise.resolve();
    const request = chrome.permissions.request as unknown as (permissions: { data_collection: string[] }) => Promise<boolean>;
    const answered = request({ data_collection: [SITE_DATA] }).catch(() => false);
    local.set({ siteAsked: true }).catch(() => {});
    return answered;
}
