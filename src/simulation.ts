// The transaction simulated over the RPC, as a cross-check the engine holds
// against the decoded instructions: whether it fails, the units it uses,
// and how the balances of the accounts it may write change. The RPC sees
// the whole transaction, and what it answers is a claim.

import { objectFields } from './json.ts';
import {
    type Balance,
    type LoadedAddresses,
    messageAccounts,
    multipleAccounts,
    type RpcAccount,
    readAccountList,
    rpcCall,
    tokenBalance,
} from './solana.ts';
import { describe, withoutControls } from './text.ts';
import type { SimulatedChange, Simulation } from './types.ts';

/** What `simulateTransaction` answers, as far as it is read. */
/** A simulation's answer as read (`readSimulation`): the node's error (null when it ran through), its logs, its units, the accounts after. */
export interface SimulationOutcome {
    err: unknown;
    logs: string[];
    unitsConsumed: number | null;
    accounts: (RpcAccount | null)[] | null;
}

/** The value of a `simulateTransaction` result, read field by field; `null` when it is not one, or its accounts are not accounts. */
export function readSimulation(result: unknown): SimulationOutcome | null {
    const value = objectFields(objectFields(result)?.value);
    if (!value) return null;
    const { err = null, logs, unitsConsumed, accounts } = value;
    const after = accounts === undefined || accounts === null ? null : readAccountList(accounts);
    if (accounts !== undefined && accounts !== null && after === null) return null;
    return {
        err,
        logs: Array.isArray(logs) ? logs.filter((line): line is string => typeof line === 'string') : [],
        unitsConsumed: typeof unitsConsumed === 'number' && Number.isInteger(unitsConsumed) && unitsConsumed >= 0 ? unitsConsumed : null,
        accounts: after,
    };
}

/** How many accounts a node reports after a simulation, at most. */
export const SIMULATED_ACCOUNTS = 18;

/** How many writable accounts are read before the simulation, at most. */
const READ_ACCOUNTS = 100;

export type SimulationResult = (Simulation & { unavailable?: string }) | null;

/** Why a simulation failed: the RPC's error, and the program's last word on it when it logged one. */
export function failureText(outcome: Pick<SimulationOutcome, 'err' | 'logs'>): string {
    const error = withoutControls(JSON.stringify(outcome.err));
    const said = outcome.logs
        .filter((line) => /^Program log: /.test(line))
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
    stop?: AbortSignal,
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
        rpcCall(
            rpc,
            'simulateTransaction',
            [
                transaction,
                {
                    encoding: 'base64',
                    sigVerify: false,
                    replaceRecentBlockhash,
                    commitment: 'confirmed',
                    accounts: { encoding: 'base64', addresses: watched },
                },
            ],
            readSimulation,
            undefined,
            stop,
        );
    try {
        const read = await multipleAccounts(rpc, addresses, stop);
        const before = new Map(addresses.map((address, i) => [address, tokenBalance(read[i])]));
        const watched = watchList(addresses, signers, before);
        const first = await run(watched, false);
        const outcome = first.err === 'BlockhashNotFound' ? await run(watched, true) : first;
        return {
            failure: outcome.err ? failureText(outcome) : null,
            units: outcome.unitsConsumed,
            changes: !outcome.err && outcome.accounts ? balanceChanges(watched, before, outcome.accounts) : [],
        };
    } catch (error) {
        return { failure: null, units: null, changes: [], unavailable: describe(error) };
    }
}
