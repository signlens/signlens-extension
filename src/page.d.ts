// The types the page's two scripts (injected.ts, content.ts) share with
// the extension's modules. Those are classic scripts, which import
// nothing, so these are global declarations: types only, nothing at run
// time. The values the scripts must copy (a timeout, names) are held to
// the modules' by protocol.test.ts.

declare namespace SignLensPage {
    /** What the extension tells every page's wallet: never the watched address, which a site gets only once allowed. */
    interface Config {
        mode: 'passthrough' | 'watch';
        upstream: string;
    }

    /** What a page may ask the extension, through the content script. */
    type Request = 'config' | 'connect' | 'explain' | 'message' | 'wallets' | 'connect-failed';
}
