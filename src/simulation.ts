// The transaction simulated over the RPC, as a cross-check the engine holds
// against the decoded instructions: whether it fails, the units it uses,
// and how the balances of the accounts it may write change. The RPC sees
// the whole transaction, and what it answers is a claim.

import { type Balance, type LoadedAddresses, messageAccounts, multipleAccounts, type RpcAccount, rpcCall, tokenBalance } from './solana.ts';
import { describe, withoutControls } from './text.ts';
import type { SimulatedChange, Simulation } from './types.ts';

/** What `simulateTransaction` answers, as far as it is read. */
export interface SimulationOutcome {
    err: unknown;
    logs?: unknown;
    unitsConsumed?: unknown;
    accounts?: unknown;
}

/** How many accounts a node reports after a simulation, at most. */
export const SIMULATED_ACCOUNTS = 18;

/** How many writable accounts are read before the simulation, at most. */
const READ_ACCOUNTS = 100;

export type SimulationResult = (Simulation & { unavailable?: string }) | null;

/** Why a simulation failed: the RPC's error, and the program's last word on it when it logged one. */
export function failureText(outcome: SimulationOutcome): string {
    const error = withoutControls(JSON.stringify(outcome.err));
    const logs = Array.isArray(outcome.logs) ? (outcome.logs as unknown[]) : [];
    const said = logs
        .filter((line): line is string => typeof line === 'string' && /^Program log: /.test(line))
        .map((line) => withoutControls(line.replace(/^Program log: /, '')).trim())
        .filter((line) => line && !/^Instruction: /.test(line))
        .at(-1);
    return `${error}${said ? `; the program said: ${said}` : ''}`.slice(0, 300);
}

/**
 * The accounts to watch, at most as many as a node reports, the ones that
 * matter most first: the signers, then their token accounts, then the rest
 * in the transaction's order.
 */
export function watchList(addresses: string[], signers: ReadonlySet<string>, before: ReadonlyMap<string, Balance | null>): string[] {
    const rank = (address: string) => (signers.has(address) ? 0 : signers.has(before.get(address)?.token?.owner ?? '') ? 1 : 2);
    return addresses
        .map((address, i) => ({ address, i, rank: rank(address) }))
        .sort((x, y) => x.rank - y.rank || x.i - y.i)
        .map((entry) => entry.address)
        .slice(0, SIMULATED_ACCOUNTS);
}

/**
 * How the balances of `watched` change from `before` to `after` (the
 * accounts as the simulation reports them, in the same order): a token
 * account's amount with its owner and mint, and any account's lamports,
 * which move for a token account too, between it and its owner's wallet.
 */
export function balanceChanges(
    watched: string[],
    before: ReadonlyMap<string, Balance | null>,
    after: readonly (RpcAccount | null | undefined)[],
): SimulatedChange[] {
    const changes: SimulatedChange[] = [];
    watched.forEach((address, i) => {
        const was = before.get(address);
        const post = tokenBalance(after[i]);
        const lamports = (post?.lamports ?? 0n) - (was?.lamports ?? 0n);
        const token = post?.token ?? was?.token;
        if (token) {
            const amount = (post?.token?.amount ?? 0n) - (was?.token?.amount ?? 0n);
            if (amount !== 0n) changes.push({ account: address, owner: token.owner, mint: token.mint, delta: amount.toString() });
        }
        if (lamports !== 0n) changes.push({ account: address, ...(token ? { owner: token.owner } : {}), delta: lamports.toString() });
    });
    return changes;
}

/**
 * Simulates `transaction` (base64) over the RPC and returns what the engine
 * takes: whether it failed, the units, and the balance changes of the
 * accounts the transaction may write, or `null` when the transaction could
 * not be parsed, or `unavailable` set when the RPC could not be asked.
 */
export async function simulate(
    transaction: string,
    bytes: Uint8Array,
    loaded: LoadedAddresses | undefined,
    rpc: string,
): Promise<SimulationResult> {
    let accounts: ReturnType<typeof messageAccounts>;
    try {
        accounts = messageAccounts(bytes);
    } catch {
        return null;
    }
    const signers = new Set(accounts.filter((a) => a.signer).map((a) => a.address));
    const addresses = [
        ...new Set(
            accounts
                .filter((a) => a.writable)
                .map((a) => a.address)
                .concat(loaded?.writable ?? []),
        ),
    ].slice(0, READ_ACCOUNTS);
    // The blockhash is kept as signed: a durable-nonce transaction checks
    // it against its nonce, and replacing it would fail that check. Only a
    // blockhash the chain no longer knows is replaced, on a second try.
    const run = (watched: string[], replaceRecentBlockhash: boolean) =>
        rpcCall<{ value: SimulationOutcome }>(rpc, 'simulateTransaction', [
            transaction,
            {
                encoding: 'base64',
                sigVerify: false,
                replaceRecentBlockhash,
                commitment: 'confirmed',
                accounts: { encoding: 'base64', addresses: watched },
            },
        ]);
    try {
        const read = await multipleAccounts(rpc, addresses);
        const before = new Map(addresses.map((address, i) => [address, tokenBalance(read[i])]));
        const watched = watchList(addresses, signers, before);
        const first = await run(watched, false);
        const outcome = (first.value.err === 'BlockhashNotFound' ? await run(watched, true) : first).value;
        return {
            failure: outcome.err ? failureText(outcome) : null,
            units: typeof outcome.unitsConsumed === 'number' && Number.isInteger(outcome.unitsConsumed) ? outcome.unitsConsumed : null,
            changes:
                !outcome.err && Array.isArray(outcome.accounts)
                    ? balanceChanges(watched, before, outcome.accounts as (RpcAccount | null)[])
                    : [],
        };
    } catch (error) {
        return { failure: null, units: null, changes: [], unavailable: describe(error) };
    }
}
