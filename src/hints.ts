// Names for tokens the engine's snapshot does not list: decimals from the
// mint accounts over the RPC, symbols from a token list. Both are claims
// the host makes, and the engine marks them so; a failure leaves the token
// unnamed. What was learned is kept for the worker's life.

import type { Settings } from './settings.ts';
import { fromBase64, isAddress, multipleAccounts, TOKEN_PROGRAMS } from './solana.ts';
import type { Amount, Effect, Explanation, TokenHint } from './types.ts';

/** Where a mint account keeps its decimals. */
const MINT_DECIMALS_OFFSET = 44;
/** Hints learned in this worker's life, by mint; `null` for a mint nothing named. */
const hintCache = new Map<string, TokenHint | null>();

/** The amounts an effect moves, a proposed one's included. */
function effectAmounts(effect: Effect): Amount[] {
    switch (effect.type) {
        case 'Transfer':
        case 'Burn':
        case 'Delegate':
        case 'Fee':
            return [effect.value.amount];
        case 'Create':
            return effect.value.deposit ? [effect.value.deposit] : [];
        case 'Proposed':
            return effectAmounts(effect.value.effect);
        default:
            return [];
    }
}

/** The mints of tokens the explanation could not name. */
export function unknownMints(document: Explanation): string[] {
    const amounts = document.effects.flatMap(effectAmounts);
    for (const section of document.sections) {
        for (const field of section.fields) if (field.value.type === 'Amount') amounts.push(field.value.value);
    }
    const mints = new Set<string>();
    for (const { asset } of amounts) {
        if (asset.decimals === null && asset.symbol === null && isAddress(asset.id)) mints.add(asset.id);
    }
    return [...mints];
}

/** Decimals from the mint accounts over the RPC: on-chain state, but the host's claim here. */
async function mintDecimals(rpc: string, mints: string[]): Promise<Map<string, number>> {
    const accounts = await multipleAccounts(rpc, mints);
    const decimals = new Map<string, number>();
    accounts.forEach((account, i) => {
        const mint = mints[i];
        if (!account || !TOKEN_PROGRAMS.has(account.owner) || mint === undefined) return;
        const data = fromBase64(account.data[0]);
        const d = data[MINT_DECIMALS_OFFSET];
        if (data.length > MINT_DECIMALS_OFFSET && d !== undefined) decimals.set(mint, d);
    });
    return decimals;
}

/** Symbols from the token list: an array of `{id, symbol, decimals}`, kept to the mints asked for, in printable ASCII. */
async function tokenSymbols(tokenApiUrl: string, mints: string[]): Promise<Map<string, { symbol: string; decimals: unknown }>> {
    const url = new URL(tokenApiUrl);
    url.searchParams.set('query', mints.join(','));
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`token list answered HTTP ${response.status}`);
    const list: unknown = await response.json();
    const symbols = new Map<string, { symbol: string; decimals: unknown }>();
    for (const token of Array.isArray(list) ? (list as { id?: unknown; symbol?: unknown; decimals?: unknown }[]) : []) {
        if (typeof token?.id !== 'string' || !mints.includes(token.id) || typeof token.symbol !== 'string') continue;
        const symbol = token.symbol
            .replace(/[^\x20-\x7e]/g, '')
            .trim()
            .slice(0, 16);
        if (symbol) symbols.set(token.id, { symbol, decimals: token.decimals });
    }
    return symbols;
}

/** Hints for `mints`, as far as the RPC and the token list name them. Failures leave tokens unnamed. */
export async function tokenHints(mints: string[], config: Pick<Settings, 'rpcUrl' | 'tokenApiUrl'>): Promise<TokenHint[]> {
    const wanted = mints.filter((mint) => !hintCache.has(mint));
    if (wanted.length > 0) {
        const [decimals, symbols] = await Promise.all([
            mintDecimals(config.rpcUrl, wanted).catch(() => new Map<string, number>()),
            tokenSymbols(config.tokenApiUrl, wanted).catch(() => new Map<string, { symbol: string; decimals: unknown }>()),
        ]);
        for (const mint of wanted) {
            const named = symbols.get(mint);
            const d = decimals.get(mint) ?? named?.decimals;
            hintCache.set(
                mint,
                named && typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 20
                    ? { mint, symbol: named.symbol, decimals: d }
                    : null,
            );
        }
    }
    return mints.map((mint) => hintCache.get(mint)).filter((hint): hint is TokenHint => hint !== null && hint !== undefined);
}
