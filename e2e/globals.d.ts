// What the test dapp (test/dapp.html) puts on `window` for the tests to drive.

interface Window {
    walletNames(): string[];
    connect(wallet: string): Promise<string>;
    connectSilently(wallet: string): Promise<string[]>;
    accountsOf(wallet: string): string[];
    sign(wallet: string, base64: string, method?: string, chain?: string): Promise<{ account?: string; signed?: number; error?: string }>;
    signTricky(wallet: string, base64: string, trick: 'mutate' | 'getter'): Promise<{ signed?: boolean; error?: string }>;
    signUnconnected(wallet: string, base64: string): Promise<{ signed?: boolean; error?: string }>;
    signAs(wallet: string, base64: string, address: string): Promise<{ signed?: number; error?: string }>;
    signMessage(wallet: string, text: string): Promise<{ signed?: boolean; error?: string }>;
    fakeCalls: { method: string; count: number }[];
    /** The transactions the fake wallet was handed, base64. */
    fakeSigned: string[];
    /** Where the page's code ran on an answer from SignLens, and what `window.event` was there. */
    eventsSeen: string[];
}
