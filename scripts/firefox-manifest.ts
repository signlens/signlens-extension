// The Firefox manifest, derived from the Chrome one: Firefox runs the
// background as a script, not a service worker, and wants its add-on id
// and a statement of the data the add-on sends away; Chrome warns about
// those keys, and Firefox about Chrome's minimum version. Everything else
// is the same file.

export interface Manifest {
    background: { service_worker: string; type?: string; scripts?: string[] };
    browser_specific_settings?: {
        gecko: { id: string; strict_min_version: string; data_collection_permissions: { required: string[]; optional?: string[] } };
    };
    minimum_chrome_version?: string;
    [key: string]: unknown;
}

/**
 * What leaves the device, in Firefox's terms: the transactions, the
 * wallet's addresses, the address book's and the accounts an explanation
 * names (financial), sent to the SignLens API, and the transactions and
 * those accounts' addresses to the RPC, none of it optional to what the
 * add-on does (the address book's names stay: src/worker/contacts.ts);
 * and the site a rating was given on (browsing activity) and the add-on's
 * version (technical), which a rating carries only once the user allowed
 * them when Firefox asked (src/shared/consent.ts).
 */
const DATA_COLLECTION = {
    required: ['financialAndPaymentInfo'],
    optional: ['browsingActivity', 'technicalAndInteraction'],
};

/**
 * Firefox 140 is the first to ask the user about an add-on's data, which
 * Mozilla requires: an earlier one would install SignLens without asking.
 */
const MIN_FIREFOX = '140.0';

/** The Chrome manifest's Firefox counterpart. */
export function firefoxManifest(chrome: Manifest): Manifest {
    const { minimum_chrome_version: _chromeOnly, ...rest } = chrome;
    const { service_worker: worker, ...background } = chrome.background;
    return {
        ...rest,
        background: { ...background, scripts: [worker] } as Manifest['background'],
        browser_specific_settings: {
            gecko: { id: 'extension@signlens.dev', strict_min_version: MIN_FIREFOX, data_collection_permissions: DATA_COLLECTION },
        },
    };
}
