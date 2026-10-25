// The accounts an explanation wants, read over the RPC (ADR-0013 in the
// engine's repository): what an instruction does sometimes depends on what
// an account it names holds, a multisig proposal's stored transaction, say,
// which the signed bytes do not carry. They go back to the API as the RPC
// returned them; the engine checks each before it uses it, and shows what
// it says as a claim that never lowers a finding.

import { objectFields } from '../shared/json.ts';
import { type AccountData, type EngineRequest, type Explanation, isError } from '../shared/types.ts';
import { explainRemotely } from './api.ts';
import { ACCOUNTS_PER_CALL, readAccountList, rpcCall } from './solana.ts';

/** How many accounts a request carries at most, as the engine takes them. */
const MAX_ACCOUNTS = 16;
/** The longest account data the engine takes, in bytes. */
const MAX_ACCOUNT_BYTES = 16 * 1024;
/** All the account data of one request, in base64 characters: the API takes 64 KB, the transaction and the rest included. */
const MAX_DATA_BASE64 = 48_000;
/** How many more times the API is asked: an account wanted can depend on another's contents, a vault transaction on its proposal's index. */
const ROUNDS = 2;

/**
 * The accounts at `addresses`, each with the slot the RPC read it at; one
 * that does not exist, or holds more than the engine takes, is left out. A
 * call that fails ends the reading with what was read before it.
 */
export async function readAccounts(url: string, addresses: string[], stop?: AbortSignal): Promise<AccountData[]> {
    const read: AccountData[] = [];
    for (let at = 0; at < addresses.length; at += ACCOUNTS_PER_CALL) {
        const batch = addresses.slice(at, at + ACCOUNTS_PER_CALL);
        const answer = (result: unknown) => {
            const fields = objectFields(result);
            const slot = objectFields(fields?.context)?.slot;
            const accounts = readAccountList(fields?.value, batch.length);
            return typeof slot === 'number' && Number.isSafeInteger(slot) && slot >= 0 && accounts ? { slot, accounts } : null;
        };
        try {
            const { slot, accounts } = await rpcCall(
                url,
                'getMultipleAccounts',
                [batch, { encoding: 'base64', commitment: 'confirmed' }],
                answer,
                10_000,
                stop,
            );
            accounts.forEach((account, i) => {
                const address = batch[i];
                // Bytes, not characters: 16 KiB and one byte take as many base64 characters as 16 KiB.
                const bytes = Math.floor(((account?.data[0].replace(/=+$/, '').length ?? 0) * 3) / 4);
                if (account && address && bytes <= MAX_ACCOUNT_BYTES) {
                    read.push({ address, owner: account.owner, data: account.data[0], slot });
                }
            });
        } catch {
            break;
        }
    }
    return read;
}

/**
 * `document` completed with the accounts it wants: read from the RPC at
 * `rpcUrl`, and the API asked again with them, up to `ROUNDS` times, as
 * long as an answer wants accounts not read yet. The last answer stands
 * with the accounts it was given; if reading or asking fails, the one
 * before it does, so the explanation is never worse for the lookup.
 */
export async function withAccounts(
    apiUrl: string,
    rpcUrl: string,
    bytes: Uint8Array,
    request: EngineRequest,
    document: Explanation,
    stop?: AbortSignal,
): Promise<{ document: Explanation; accounts: AccountData[] }> {
    let accounts: AccountData[] = [];
    const asked = new Set<string>();
    for (let round = 0; round < ROUNDS; round++) {
        const wanted = (document.wanted_accounts ?? [])
            .map((account) => account.address)
            .filter((address) => !asked.has(address))
            .slice(0, MAX_ACCOUNTS - asked.size);
        if (wanted.length === 0) break;
        for (const address of wanted) asked.add(address);
        let size = accounts.reduce((total, account) => total + account.data.length, 0);
        const more = [...accounts];
        for (const account of await readAccounts(rpcUrl, wanted, stop)) {
            if (size + account.data.length > MAX_DATA_BASE64) continue;
            size += account.data.length;
            more.push(account);
        }
        if (more.length === accounts.length) break;
        const answer = await explainRemotely(apiUrl, bytes, { ...request, accounts: more }, stop);
        if (isError(answer)) break;
        document = answer;
        accounts = more;
    }
    return { document, accounts };
}
