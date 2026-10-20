// The first half of `npm run build`: an empty dist/chrome with the static
// files in it (the manifest, the pages, the stylesheet and the icons, from
// static/). tsc then writes the scripts beside them, in the folders they
// have under src/. Emptied each time, so nothing of an earlier build, a
// script whose source was moved or deleted, can stay behind and ship.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATIC = join(HERE, '../static');
const CHROME = join(HERE, '../dist/chrome');

rmSync(CHROME, { recursive: true, force: true });
mkdirSync(CHROME, { recursive: true });
cpSync(STATIC, CHROME, { recursive: true });
