// The types the page's two scripts (injected.ts, content.ts) share with
// the extension's modules. Those are classic scripts, which import
// nothing, so these are global declarations: types only, nothing at run
// time. Every message the scripts exchange is typed here, so that a name
// spelled otherwise on one side does not compile; the values the scripts
// copy (the requests, a timeout) are held to the modules' by
// protocol.test.ts.

declare namespace SignLensPage {
    /** What the extension tells every page's wallet: never the watched address, which a site gets only once allowed. */
    interface Config {
        mode: 'passthrough' | 'watch';
        upstream: string;
    }

    /** What a page may ask the extension, through the content script. */
    type Request = 'config' | 'connect' | 'explain' | 'message' | 'wallets' | 'connect-failed';

    /** The window message the wallet offers its port in: the one message of the two scripts the page could see (it does not: content.ts stops it). */
    interface Offer {
        channel: 'signlens';
        to: 'extension';
        type: 'port';
    }

    /** What the content script tells the wallet over the port unasked: the port is connected, or a setting the wallet acts on changed. */
    type Notice = { type: 'connected' } | { type: 'config-changed'; config: Config | null };

    /** What the popup asks a tab's content script: whether it runs there, and whether a wallet's port reached it. */
    interface Ping {
        type: 'ping';
    }
    interface PingReply {
        port: boolean;
    }
}
