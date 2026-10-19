// The Firefox manifest, derived from the Chrome one: Firefox runs the
// background as a script, not a service worker, and wants its add-on id;
// Chrome warns about both keys. Everything else is the same file.

export interface Manifest {
    background: { service_worker: string; type?: string; scripts?: string[] };
    browser_specific_settings?: { gecko: { id: string; strict_min_version: string } };
    [key: string]: unknown;
}

/** The Chrome manifest's Firefox counterpart. */
export function firefoxManifest(chrome: Manifest): Manifest {
    const { service_worker: worker, ...background } = chrome.background;
    return {
        ...chrome,
        background: { ...background, scripts: [worker] } as Manifest['background'],
        browser_specific_settings: {
            gecko: { id: 'extension@signlens.dev', strict_min_version: '128.0' },
        },
    };
}
