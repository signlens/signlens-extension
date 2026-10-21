// Names for tokens the engine's snapshot does not list: decimals from the
// mint accounts over the RPC, symbols from a token list. Both are claims
// the host makes, and the engine marks them so; a failure leaves the token
// unnamed. What was learned is kept for the worker's life, for the
// endpoints that answered; a lookup that failed is asked again next time.

import { refusedEndpoint, within } from '../shared/endpoint.ts';
import type { Settings } from '../shared/settings.ts';
import type { Amount, Effect, Explanation, TokenHint } from '../shared/types.ts';
import { fromBase64, isAddress, multipleAccounts, TOKEN_PROGRAMS } from './solana.ts';

/** Where a mint account keeps its decimals. */
const MINT_DECIMALS_OFFSET = 44;
/** Hints learned in this worker's life, by RPC, token list and mint; `null` for a mint both answered for without naming it. */
const hintCache = new Map<string, TokenHint | null>();

/** The amounts an effect moves, a proposed one's included. */
function effectAmounts(effect: Effect): Amount[] {
    switch (effect.type) {
        case 'transfer':
        case 'burn':
        case 'delegate':
        case 'fee':
            return [effect.value.amount];
        case 'create':
            return effect.value.deposit ? [effect.value.deposit] : [];
        case 'proposed':
            return effectAmounts(effect.value.effect);
        default:
            return [];
    }
}

/** The mints of tokens the explanation could not name. */
export function unknownMints(document: Explanation): string[] {
    const amounts = document.effects.flatMap(effectAmounts);
    for (const section of document.sections) {
        for (const field of section.fields) if (field.value.type === 'amount') amounts.push(field.value.value);
    }
    const mints = new Set<string>();
    for (const { asset } of amounts) {
        if (asset.decimals === null && asset.symbol === null && isAddress(asset.id)) mints.add(asset.id);
    }
    return [...mints];
}

/** Decimals from the mint accounts over the RPC: on-chain state, but the host's claim here. */
async function mintDecimals(rpc: string, mints: string[], stop?: AbortSignal): Promise<Map<string, number>> {
    const accounts = await multipleAccounts(rpc, mints, stop);
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
async function tokenSymbols(
    tokenApiUrl: string,
    mints: string[],
    stop?: AbortSignal,
): Promise<Map<string, { symbol: string; decimals: unknown }>> {
    const refused = refusedEndpoint(tokenApiUrl, 'token list');
    if (refused) throw new Error(refused);
    const url = new URL(tokenApiUrl);
    url.searchParams.set('query', mints.join(','));
    const response = await fetch(url, { signal: within(10_000, stop) });
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

/** Hints for `mints`, as far as the RPC and the token list name them, until `stop`. Failures leave tokens unnamed. */
export async function tokenHints(
    mints: string[],
    config: Pick<Settings, 'rpcUrl' | 'tokenApiUrl'>,
    stop?: AbortSignal,
): Promise<TokenHint[]> {
    const key = (mint: string) => `${config.rpcUrl} ${config.tokenApiUrl} ${mint}`;
    const wanted = mints.filter((mint) => !hintCache.has(key(mint)));
    if (wanted.length > 0) {
        let failed = false;
        const [decimals, symbols] = await Promise.all([
            mintDecimals(config.rpcUrl, wanted, stop).catch(() => {
                failed = true;
                return new Map<string, number>();
            }),
            tokenSymbols(config.tokenApiUrl, wanted, stop).catch(() => {
                failed = true;
                return new Map<string, { symbol: string; decimals: unknown }>();
            }),
        ]);
        for (const mint of wanted) {
            const named = symbols.get(mint);
            const d = decimals.get(mint) ?? named?.decimals;
            const hint =
                named && typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 20
                    ? { mint, symbol: named.symbol, decimals: d }
                    : null;
            if (hint || !failed) hintCache.set(key(mint), hint);
        }
    }
    return mints.map((mint) => hintCache.get(key(mint))).filter((hint): hint is TokenHint => hint !== null && hint !== undefined);
}
