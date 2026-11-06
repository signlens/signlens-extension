// The transaction versions SignLens tells a dapp it signs, which the dapp
// builds for (jup.ag builds v1 only for a wallet that lists it). The bytes
// go on unchanged, so SignLens lists only what it reads and the wallet
// behind it takes: before a connect legacy and v0; connected through a
// wallet, that wallet's own; watching, where nothing is signed, all
// SignLens reads.

import { expect, test } from './support/extension.ts';

const WALLET = 'SignLens';
const WATCHED = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const BEFORE_V1 = { sign: ['legacy', 0], send: ['legacy', 0] };

test('connected through a wallet that signs v1, SignLens lists v1 to sign, tells the dapp so, and stops at the end of the session', async ({
    configure,
    dapp,
}) => {
    await configure({ mode: 'passthrough', upstream: 'Fake Wallet' });
    expect(await dapp.evaluate((wallet: string) => window.versionsOf(wallet), WALLET)).toEqual(BEFORE_V1);
    await dapp.evaluate((wallet: string) => window.connect(wallet), WALLET);
    // The test dapp's wallet signs v1, and has no way to sign and send: SignLens says no more for that.
    expect(await dapp.evaluate((wallet: string) => window.versionsOf(wallet), WALLET)).toEqual({
        sign: ['legacy', 0, 1],
        send: ['legacy', 0],
    });
    expect(await dapp.evaluate(() => window.changes)).toEqual([['accounts', 'features']]);
    await dapp.evaluate((wallet: string) => window.disconnect(wallet), WALLET);
    expect(await dapp.evaluate((wallet: string) => window.versionsOf(wallet), WALLET)).toEqual(BEFORE_V1);
});

test('connected through a wallet that does not sign v1, SignLens does not list it either', async ({ configure, dapp }) => {
    await dapp.evaluate(() => window.addWallet('Other Wallet'));
    await configure({ mode: 'passthrough', upstream: 'Other Wallet' });
    await dapp.evaluate((wallet: string) => window.connect(wallet), WALLET);
    expect(await dapp.evaluate((wallet: string) => window.versionsOf(wallet), WALLET)).toEqual(BEFORE_V1);
});

test('watching, SignLens lists legacy, v0 and v1: it reads all three, and nothing is signed', async ({ configure, dapp }) => {
    await configure({ mode: 'watch', address: WATCHED, askFirst: false });
    expect(await dapp.evaluate((wallet: string) => window.connect(wallet), WALLET)).toBe(WATCHED);
    expect(await dapp.evaluate((wallet: string) => window.versionsOf(wallet), WALLET)).toEqual({
        sign: ['legacy', 0, 1],
        send: ['legacy', 0, 1],
    });
});
