// The simulation's pure parts: which accounts are watched, how balances
// change, and what is said of a failure.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceChanges, failureText, SIMULATED_ACCOUNTS, watchList } from './simulation.ts';
import { type Balance, base58Decode, type RpcAccount, toBase64, tokenBalance } from './solana.ts';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM = '11111111111111111111111111111111';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PAYER = 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp';
const SOURCE = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const OTHER = 'So11111111111111111111111111111111111111112';

function key(address: string): Uint8Array {
    const bytes = base58Decode(address);
    if (!bytes) throw new Error(`not an address: ${address}`);
    return bytes;
}

function wallet(lamports: number): RpcAccount {
    return { owner: SYSTEM, lamports, data: ['', 'base64'] };
}

function tokenAccount(owner: string, amount: bigint, lamports = 2_039_280): RpcAccount {
    const data = new Uint8Array(165);
    data.set(key(USDC), 0);
    data.set(key(owner), 32);
    new DataView(data.buffer).setBigUint64(64, amount, true);
    return { owner: TOKEN_PROGRAM, lamports, data: [toBase64(data), 'base64'] };
}

function balances(entries: [string, RpcAccount | null][]): Map<string, Balance | null> {
    return new Map(entries.map(([address, account]) => [address, tokenBalance(account)]));
}

test('a token account moves its amount, with its owner and mint; a wallet its lamports', () => {
    const watched = [PAYER, SOURCE, OTHER];
    const before = balances([
        [PAYER, wallet(1_000_000_000)],
        [SOURCE, tokenAccount(PAYER, 5_000_000n)],
        [OTHER, wallet(5)],
    ]);
    const after = [wallet(1_000_000_000 - 12_218), tokenAccount(PAYER, 5_000_000n - 996_423n), wallet(5)];
    assert.deepEqual(balanceChanges(watched, before, after), [
        { account: PAYER, delta: '-12218' },
        { account: SOURCE, owner: PAYER, mint: USDC, delta: '-996423' },
    ]);
});

test('an account closed or created moves its rent too, named with the token it held', () => {
    const before = balances([[SOURCE, tokenAccount(PAYER, 0n)]]);
    assert.deepEqual(balanceChanges([SOURCE], before, [null]), [{ account: SOURCE, owner: PAYER, delta: '-2039280' }]);
    assert.deepEqual(balanceChanges([SOURCE], new Map([[SOURCE, null]]), [tokenAccount(PAYER, 7n)]), [
        { account: SOURCE, owner: PAYER, mint: USDC, delta: '7' },
        { account: SOURCE, owner: PAYER, delta: '2039280' },
    ]);
});

test('the signers are watched first, then their token accounts, then the rest in order, as many as a node reports', () => {
    const rest = Array.from({ length: 30 }, (_, i) => `rest${i}`);
    const addresses = [...rest.slice(0, 2), SOURCE, ...rest.slice(2), PAYER];
    const before = balances([[SOURCE, tokenAccount(PAYER, 1n)]]);
    const watched = watchList(addresses, new Set([PAYER]), before);
    assert.equal(watched.length, SIMULATED_ACCOUNTS);
    assert.deepEqual(watched.slice(0, 4), [PAYER, SOURCE, 'rest0', 'rest1']);
});

test("a failure quotes the program's last word, without its control characters", () => {
    assert.equal(
        failureText({
            err: { InstructionError: [2, { Custom: 6001 }] },
            logs: [
                'Program log: Instruction: Swap',
                'Program log: Slippage\u0007 exceeded',
                'Program log: Instruction: Done',
                'Program X failed',
            ],
        }),
        '{"InstructionError":[2,{"Custom":6001}]}; the program said: Slippage? exceeded',
    );
    assert.equal(failureText({ err: 'BlockhashNotFound' }), '"BlockhashNotFound"');
    assert.equal(failureText({ err: 'x', logs: [`Program log: ${'y'.repeat(400)}`] }).length, 300);
});
