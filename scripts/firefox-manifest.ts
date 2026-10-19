// The Firefox manifest, derived from the Chrome one: Firefox runs the
// background as a script, not a service worker, and wants its add-on id
// and a statement of the data the add-on sends away; Chrome warns about
// those keys, and Firefox about Chrome's minimum version. Everything else
// is the same file.

export interface Manifest {
    background: { service_worker: string; type?: string; scripts?: string[] };
    browser_specific_settings?: {
        gecko: { id: string; strict_min_version: string; data_collection_permissions: { required: string[] } };
    };
    minimum_chrome_version?: string;
    [key: string]: unknown;
}

/**
 * What leaves the device, in Firefox's terms: the transactions and the
 * wallet's addresses (financial), and the names in the address book
 * (personally identifying), sent to the SignLens API, and the transactions
 * to the RPC. None of it is optional to what the add-on does.
 */
const DATA_COLLECTION = { required: ['financialAndPaymentInfo', 'personallyIdentifyingInfo'] };

/** The Chrome manifest's Firefox counterpart. */
export function firefoxManifest(chrome: Manifest): Manifest {
    const { minimum_chrome_version: _chromeOnly, ...rest } = chrome;
    const { service_worker: worker, ...background } = chrome.background;
    return {
        ...rest,
        background: { ...background, scripts: [worker] } as Manifest['background'],
        browser_specific_settings: {
            gecko: { id: 'extension@signlens.dev', strict_min_version: '128.0', data_collection_permissions: DATA_COLLECTION },
        },
    };
}
