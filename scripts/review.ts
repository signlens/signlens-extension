// A translation's review, as the engine's are (its docs/translating.md):
//
//   node scripts/review.ts sheet <locale> --pass critical|rest [--extra <tsv>] [--out <csv>]
//   node scripts/review.ts apply <locale> <csv>
//   node scripts/review.ts record <locale> --by <who>… --on <yyyy-mm-dd>
//
// `sheet` writes the reviewer's spreadsheet, one row per distinct English
// and translation, with the identifiers that share them: `critical` is
// what the signing window shows (window.ftl, verdict.ftl, worker.ftl),
// read first; `rest` is everything else. `--extra` adds a back-translation
// and an example from a TSV (id, back-translation, example, flag). The
// reviewer marks each row in `verdict` and writes a corrected translation,
// as Fluent, in `correction`. `apply` writes each correction into the
// locale's files, for every identifier of its row. `record` writes
// locales/<locale>.review.json: who reviewed it, when (a role, never a
// name), and a digest of each message's English as it was reviewed, which
// the catalog holds each translation to (scripts/messages.ts).

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Message, parse, Resource, serialize } from '@fluent/syntax';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const LOCALES = join(ROOT, 'locales');
/** The files of what the signing window shows, which the review reads first. */
const CRITICAL = new Set(['window.ftl', 'verdict.ftl', 'worker.ftl']);
const COLUMNS = ['ids', 'english', 'comment', 'translation', 'back_translation', 'example', 'verdict', 'correction', 'note'] as const;

/** A message as Fluent text without its identifier: its value, then each attribute on a line of its own. */
export function body(message: Message): string {
    const copy = new Message(message.id, message.value, message.attributes, null);
    const text = serialize(new Resource([copy]), {}).trimEnd();
    const rest = text.slice(text.indexOf('=') + 1);
    const lines = rest
        .replace(/^ /, '')
        .split('\n')
        .map((line, i) => (i === 0 ? line : line.replace(/^ {4}/, '')))
        .join('\n');
    // A value that starts on its own line (a choice) starts the text; a message of attributes alone keeps its first line empty.
    return message.value ? lines.replace(/^\n/, '') : lines;
}

/** The digest a review binds a translation to: its English, as Fluent text. */
export function digest(english: string): string {
    return createHash('sha256').update(english).digest('hex').slice(0, 16);
}

/** Each message of `tag`, by identifier: the file it is in, its text and its comment. */
export function messagesOf(tag: string, locales = LOCALES): Map<string, { file: string; text: string; comment: string }> {
    const out = new Map<string, { file: string; text: string; comment: string }>();
    const dir = join(locales, tag);
    if (!existsSync(dir)) return out;
    for (const file of readdirSync(dir)
        .filter((f) => f.endsWith('.ftl'))
        .sort()) {
        for (const entry of parse(readFileSync(join(dir, file), 'utf8'), { withSpans: false }).body) {
            if (entry instanceof Message) out.set(entry.id.name, { file, text: body(entry), comment: entry.comment?.content ?? '' });
        }
    }
    return out;
}

/** A CSV cell, always quoted. */
const cell = (value: string): string => `"${value.replaceAll('"', '""')}"`;

/** The rows of a CSV, quoted cells and newlines inside them read back. */
export function readCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    const source = text.replace(/^﻿/, '');
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (quoted) {
            if (c === '"' && source[i + 1] === '"') {
                value += '"';
                i++;
            } else if (c === '"') quoted = false;
            else value += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') {
            row.push(value);
            value = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && source[i + 1] === '\n') i++;
            row.push(value);
            rows.push(row);
            row = [];
            value = '';
        } else value += c;
    }
    if (value !== '' || row.length > 0) {
        row.push(value);
        rows.push(row);
    }
    return rows;
}

/** The reviewer's sheet for `tag`'s `pass`. */
export function sheet(tag: string, pass: 'critical' | 'rest', extra?: string, locales = LOCALES): string {
    const english = messagesOf('en', locales);
    const translated = messagesOf(tag, locales);
    const extras = new Map<string, string[]>();
    for (const line of (extra ?? '').split('\n')) {
        const [id, ...fields] = line.split('\t');
        if (id) extras.set(id, fields);
    }
    const groups = new Map<string, { ids: string[]; english: string; comment: string; translation: string }>();
    for (const [id, source] of english) {
        if (CRITICAL.has(source.file) !== (pass === 'critical')) continue;
        const translation = translated.get(id)?.text ?? '';
        const key = `${source.text}\u0000${translation}`;
        const group = groups.get(key);
        if (group) group.ids.push(id);
        else groups.set(key, { ids: [id], english: source.text, comment: source.comment, translation });
    }
    const lines = [COLUMNS.join(',')];
    for (const group of groups.values()) {
        const [back = '', example = ''] = group.ids.map((id) => extras.get(id)).find((fields) => fields) ?? [];
        lines.push([group.ids.join(' '), group.english, group.comment, group.translation, back, example, '', '', ''].map(cell).join(','));
    }
    return `﻿${lines.join('\r\n')}\r\n`;
}

/** `tag`'s files with each correction of `csv` in place, for every identifier of its row; the count of messages corrected. */
export function apply(tag: string, csv: string, locales = LOCALES): number {
    const [header, ...rows] = readCsv(csv);
    const at = (name: string): number => header?.indexOf(name) ?? -1;
    const [ids, correction] = [at('ids'), at('correction')];
    if (ids < 0 || correction < 0) throw new Error('a sheet needs its ids and correction columns');
    const english = messagesOf('en', locales);
    let count = 0;
    for (const row of rows) {
        // Only the end is trimmed: a message of attributes alone starts with an empty line.
        const text = row[correction]?.trimEnd() ?? '';
        if (!text.trim()) continue;
        for (const id of (row[ids] ?? '').split(/\s+/).filter(Boolean)) {
            const source = english.get(id);
            if (!source) throw new Error(`${id}: no English message`);
            const file = join(locales, tag, source.file);
            const entry = `${id} = ${text.split('\n').join('\n    ')}\n`;
            const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
            const parsed = parse(current, { withSpans: true }).body.find((e) => e instanceof Message && e.id.name === id);
            const span = parsed?.span;
            const next = span
                ? `${current.slice(0, span.start)}${entry}${current.slice(span.end).replace(/^\n/, '')}`
                : `${current}${entry}`;
            writeFileSync(file, next);
            count++;
        }
    }
    return count;
}

/** The review record of `tag`: who reviewed it and when, and the digest of each translated message's English. */
export function record(tag: string, by: string[], on: string, locales = LOCALES): string {
    const english = messagesOf('en', locales);
    const digests: Record<string, string> = {};
    for (const id of [...messagesOf(tag, locales).keys()].sort()) {
        const source = english.get(id);
        if (source) digests[id] = digest(source.text);
    }
    return `${JSON.stringify({ by, on, digests }, null, 2)}\n`;
}

/** The value after `flag`, and every value after it up to the next flag. */
function values(args: string[], flag: string): string[] {
    const at = args.indexOf(flag);
    if (at < 0) return [];
    const out: string[] = [];
    for (const arg of args.slice(at + 1)) {
        if (arg.startsWith('--')) break;
        out.push(arg);
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, tag, ...args] = process.argv.slice(2);
    if (!tag || tag === 'en') throw new Error('name a locale other than English');
    if (command === 'sheet') {
        const pass = values(args, '--pass')[0];
        if (pass !== 'critical' && pass !== 'rest') throw new Error('--pass critical or --pass rest');
        const extraFile = values(args, '--extra')[0];
        const out = values(args, '--out')[0] ?? `${tag}-${pass}.csv`;
        writeFileSync(out, sheet(tag, pass, extraFile ? readFileSync(extraFile, 'utf8') : undefined));
        console.error(`${out}: written`);
    } else if (command === 'apply') {
        const file = args[0];
        if (!file) throw new Error('name the sheet');
        console.error(`${file}: ${apply(tag, readFileSync(file, 'utf8'))} message(s) corrected; run \`npm run messages\` to check them`);
    } else if (command === 'record') {
        const by = values(args, '--by');
        const on = values(args, '--on')[0] ?? '';
        if (by.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error('--by <who>… --on <yyyy-mm-dd>');
        writeFileSync(join(LOCALES, `${tag}.review.json`), record(tag, by, on));
        console.error(`locales/${tag}.review.json: written`);
    } else throw new Error('sheet, apply or record');
}
