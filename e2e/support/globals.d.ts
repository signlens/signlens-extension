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
    /** Registers another wallet under `name`, with the fake one's icon or `icon`, as a second extension would. */
    addWallet(name: string, icon?: string): void;
    /** What the wallets `addWallet` registered were asked to sign. */
    otherCalls: { wallet: string; count: number }[];
    /** Where the page's code ran on an answer from SignLens, and what `window.event` was there. */
    eventsSeen: string[];
}
