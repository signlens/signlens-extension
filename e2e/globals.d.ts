// What the test dapp (e2e/dapp.html) puts on `window` for the tests to drive.

interface Window {
    walletNames(): string[];
    connect(wallet: string): Promise<string>;
    sign(wallet: string, base64: string, method?: string): Promise<{ account?: string; signed?: number; error?: string }>;
    signMessage(wallet: string, text: string): Promise<{ signed?: boolean; error?: string }>;
    fakeCalls: { method: string; count: number }[];
}
