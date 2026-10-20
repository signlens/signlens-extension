// `npm run build:firefox`: a copy of the built extension under dist/firefox
// with the Firefox manifest. Chrome loads dist/chrome as it is.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest, type Manifest } from './firefox-manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = join(HERE, '../dist/chrome');
const FIREFOX = join(HERE, '../dist/firefox');

rmSync(FIREFOX, { recursive: true, force: true });
mkdirSync(FIREFOX, { recursive: true });
cpSync(CHROME, FIREFOX, { recursive: true });
const manifest = JSON.parse(readFileSync(join(CHROME, 'manifest.json'), 'utf8')) as Manifest;
writeFileSync(join(FIREFOX, 'manifest.json'), `${JSON.stringify(firefoxManifest(manifest), null, 2)}\n`);
console.log(`Firefox copy in ${FIREFOX}: load its manifest.json as a temporary add-on.`);
