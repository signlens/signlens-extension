// `npm run icons`: the extension's icons, made from the one drawing in
// docs/design/icon.svg, so that no size drifts from the others:
//
// - static/icons/icon-16, -32 and -48.png: the drawing at that size, for
//   the toolbar and the extensions page;
// - static/icons/icon-128.png: the drawing at 96 px with 16 px of
//   transparent padding on every side, as the Chrome Web Store asks;
// - the wallet icon a dapp shows in its list of wallets, written into
//   src/page/injected.ts (which imports nothing) as the same SVG.
//
// The PNGs are rasterised by the end-to-end tests' Chromium, and committed;
// icons.test.ts holds them and the wallet icon to the drawing.

import { readFileSync, writeFileSync } from 'node:fs';

const DRAWING = new URL('../docs/design/icon.svg', import.meta.url);
const ICONS = new URL('../static/icons/', import.meta.url);
const PAGE_SCRIPT = new URL('../src/page/injected.ts', import.meta.url);

/** The icon sizes the manifest names, and how much of each the drawing fills (the rest is transparent). */
export const SIZES = [
    { size: 16, drawn: 16 },
    { size: 32, drawn: 32 },
    { size: 48, drawn: 48 },
    { size: 128, drawn: 96 },
] as const;

/** `svg` on one line: what the wallet icon carries. */
export function minified(svg: string): string {
    return svg.replace(/>\s+</g, '><').trim();
}

/** The wallet icon for `svg`, as Wallet Standard takes it: a data URL. */
export function walletIcon(svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(minified(svg)).toString('base64')}`;
}

/** The wallet icon in a page script's source, or `null` when it has none. */
export function iconIn(source: string): string | null {
    return /const ICON =\s*'(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)'/.exec(source)?.[1] ?? null;
}

if (import.meta.main) {
    const { chromium } = await import('@playwright/test');
    const svg = readFileSync(DRAWING, 'utf8');
    const icon = walletIcon(svg);
    const browser = await chromium.launch();
    try {
        for (const { size, drawn } of SIZES) {
            const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
            const margin = (size - drawn) / 2;
            await page.setContent(
                `<html><body style="margin:0;background:transparent"><img src="${icon}" width="${drawn}" height="${drawn}" style="display:block;margin:${margin}px"></body></html>`,
            );
            await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
            writeFileSync(new URL(`icon-${size}.png`, ICONS), await page.screenshot({ omitBackground: true, type: 'png' }));
            await page.close();
        }
    } finally {
        await browser.close();
    }
    const source = readFileSync(PAGE_SCRIPT, 'utf8');
    const old = iconIn(source);
    if (!old) throw new Error('src/page/injected.ts has no `const ICON = ...` to write the wallet icon into');
    writeFileSync(PAGE_SCRIPT, source.replace(old, icon));
    console.log(`static/icons/icon-{${SIZES.map((s) => s.size).join(',')}}.png and the wallet icon, from docs/design/icon.svg`);
}
