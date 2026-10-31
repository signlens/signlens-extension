// Every page in the pseudo-locale (en-XA, ADR-0015 decision 11), in the
// states axe.spec.ts checks: each of the extension's own words comes out
// accented and bracketed, so a visible text or a worded attribute that
// does not was left in code (support/words.ts).

import { expect, test } from './support/extension.ts';
import { eachPage, englishLeft } from './support/words.ts';

test.use({ browserLocale: 'en-XA' });

test('every page is worded in the pseudo-locale, none of its words left in English', async ({ context, extensionId, popup, worker }) => {
    await eachPage({ context, extensionId, popup, worker }, async (page, state) => {
        await expect(page.locator('html'), state).toHaveAttribute('lang', 'en-XA');
        expect(await englishLeft(page, 'en-XA', /[[\]áéíóúýñçÁÉÍÓÚÝÑÇ·]/), state).toEqual([]);
    });
});
