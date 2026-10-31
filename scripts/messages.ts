// `npm run messages`: compiles the interface's words, locales/<locale>/*.ftl
// (Fluent, as the engine's are), into src/shared/catalog.ts: each message's
// pattern for the runtime (src/shared/fluent.ts) and the types of its
// arguments, so that asking for a message that does not exist, or with the
// wrong arguments, fails to compile. English is the source: another
// locale's message needs an English one, and may use no argument,
// attribute or named link the English does not. The catalog is committed,
// and a test fails when it is out of date (src/shared/catalog.test.ts).

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type Pattern as FluentPattern,
    Identifier,
    Junk,
    Message,
    NumberLiteral,
    Placeable,
    parse,
    SelectExpression,
    StringLiteral,
    Term,
    TermReference,
    TextElement,
    VariableReference,
} from '@fluent/syntax';
import { MARKUP, type Part, type Pattern } from '../src/shared/fluent.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'locales');
export const CATALOG = join(ROOT, 'src/shared/catalog.ts');
const SOURCE = 'en';
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
/** What looks like a tag, allowed or not. */
const TAG = /<\/?[A-Za-z][^<>]*>/g;

/** An argument's type: a number, which a plural choice reads, or any value. */
type Kind = 'number' | 'value';

interface Compiled {
    value?: Pattern;
    attributes: Record<string, Pattern>;
    args: Map<string, Kind>;
    names: Set<string>;
}

/** Every message of `tag`, compiled, and what was wrong with its files. */
function compileLocale(tag: string, problems: string[]): Map<string, Compiled> {
    const dir = join(LOCALES, tag);
    const messages = new Map<string, [Message, string]>();
    const terms = new Map<string, Term>();
    for (const file of readdirSync(dir)
        .filter((f) => f.endsWith('.ftl'))
        .sort()) {
        const where = `locales/${tag}/${file}`;
        for (const entry of parse(readFileSync(join(dir, file), 'utf8'), { withSpans: false }).body) {
            if (entry instanceof Junk)
                problems.push(`${where}: ${entry.annotations.map((a) => a.message).join('; ')}: ${entry.content.trim().slice(0, 60)}`);
            else if (entry instanceof Message) {
                if (messages.has(entry.id.name)) problems.push(`${where}: ${entry.id.name} is defined twice`);
                messages.set(entry.id.name, [entry, where]);
            } else if (entry instanceof Term) terms.set(entry.id.name, entry);
        }
    }
    const out = new Map<string, Compiled>();
    for (const [id, [message, where]] of [...messages].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const compiled: Compiled = { attributes: {}, args: new Map(), names: new Set() };
        const at = `${where}: ${id}`;
        if (message.value) compiled.value = compilePattern(message.value, terms, compiled, at, problems);
        for (const attribute of message.attributes)
            compiled.attributes[attribute.id.name] = compilePattern(
                attribute.value,
                terms,
                compiled,
                `${at}.${attribute.id.name}`,
                problems,
            );
        out.set(id, compiled);
    }
    return out;
}

/** A Fluent pattern as the catalog keeps it, its markup checked. */
function compilePattern(pattern: FluentPattern, terms: Map<string, Term>, into: Compiled, at: string, problems: string[]): Pattern {
    const out: Part[] = [];
    const text = (value: string): void => {
        const last = out.at(-1);
        if (typeof last === 'string') out[out.length - 1] = last + value;
        else out.push(value);
    };
    const expression = (node: unknown): void => {
        if (node instanceof StringLiteral) text(node.parse().value);
        else if (node instanceof NumberLiteral) text(node.value);
        else if (node instanceof VariableReference) {
            if (!into.args.has(node.id.name)) into.args.set(node.id.name, 'value');
            out.push({ arg: node.id.name });
        } else if (node instanceof TermReference && !node.attribute && !node.arguments) {
            const term = terms.get(node.id.name);
            if (!term) problems.push(`${at}: no term -${node.id.name}`);
            else
                for (const part of compilePattern(term.value, terms, into, at, problems)) {
                    if (typeof part === 'string') text(part);
                    else out.push(part);
                }
        } else if (node instanceof SelectExpression && node.selector instanceof VariableReference) {
            const cases: Record<string, Pattern> = {};
            let other = '';
            for (const variant of node.variants) {
                const key = variant.key instanceof Identifier ? variant.key.name : variant.key.value;
                cases[key] = compilePattern(variant.value, terms, into, `${at} [${key}]`, problems);
                if (variant.default) other = key;
            }
            const plural = Object.keys(cases).every((key) => PLURAL.has(key) || /^\d+$/.test(key));
            const name = node.selector.id.name;
            into.args.set(name, plural || into.args.get(name) === 'number' ? 'number' : 'value');
            out.push({ select: name, cases, other });
        } else if (node instanceof Placeable) expression(node.expression);
        else problems.push(`${at}: Fluent the catalog cannot compile (${(node as { type?: string }).type ?? 'unknown'})`);
    };
    for (const element of pattern.elements) {
        if (element instanceof TextElement) text(element.value);
        else expression(element.expression);
    }
    checkMarkup(out, into, at, problems);
    return out;
}

/** Only the markup fluent.ts allows, each element closed in the pattern that opens it. */
function checkMarkup(pattern: Pattern, into: Compiled, at: string, problems: string[]): void {
    const open: string[] = [];
    for (const part of pattern) {
        if (typeof part !== 'string') continue;
        for (const [tag] of part.matchAll(TAG)) {
            const allowed = [...tag.matchAll(MARKUP)][0];
            if (!allowed || allowed[0] !== tag) {
                problems.push(`${at}: markup the catalog does not allow: ${tag}`);
                continue;
            }
            const [, closing, name, linkName] = allowed;
            if (linkName) into.names.add(linkName);
            if (!closing) open.push(name ?? '');
            else if (open.pop() !== name) problems.push(`${at}: </${name}> closes what it did not open`);
        }
    }
    if (open.length > 0) problems.push(`${at}: <${open.join('>, <')}> left open`);
}

/** A translation held to its English: a message, arguments, attributes and named links the English has. */
function checkAgainst(tag: string, locale: Map<string, Compiled>, english: Map<string, Compiled>, problems: string[]): void {
    for (const [id, message] of locale) {
        const source = english.get(id);
        const at = `locales/${tag}: ${id}`;
        if (!source) {
            problems.push(`${at}: no English message`);
            continue;
        }
        for (const name of message.args.keys())
            if (!source.args.has(name)) problems.push(`${at}: $${name}, which the English does not have`);
        for (const name of Object.keys(message.attributes))
            if (!(name in source.attributes)) problems.push(`${at}: .${name}, which the English does not have`);
        for (const name of message.names)
            if (!source.names.has(name)) problems.push(`${at}: a link named ${name}, which the English does not have`);
        if ((message.value === undefined) !== (source.value === undefined))
            problems.push(`${at}: a value where the English has none, or none where it has one`);
    }
}

/** The pseudo-locale, made from the English as each message is worded, as the engine's is (ADR-0015, decision 11). */
const PSEUDO = 'en-XA';
const ACCENTED: Readonly<Record<string, string>> = {
    a: 'á',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ú',
    y: 'ý',
    n: 'ñ',
    c: 'ç',
    A: 'Á',
    E: 'É',
    I: 'Í',
    O: 'Ó',
    U: 'Ú',
    Y: 'Ý',
    N: 'Ñ',
    C: 'Ç',
};

/** `text` with each letter that has an accented form accented, its markup as it is. */
function accent(text: string): string {
    let out = '';
    let at = 0;
    const plain = (piece: string): string => piece.replace(/[aeiouyncAEIOUYNC]/g, (c) => ACCENTED[c] ?? c);
    for (const match of text.matchAll(MARKUP)) {
        out += plain(text.slice(at, match.index)) + match[0];
        at = match.index + match[0].length;
    }
    return out + plain(text.slice(at));
}

/** How many letters a pattern's English has, along its default cases, its markup left out. */
function length(pattern: Pattern): number {
    let count = 0;
    for (const part of pattern) {
        if (typeof part === 'string') count += part.replace(MARKUP, '').length;
        else if ('select' in part) count += length(part.cases[part.other] ?? []);
    }
    return count;
}

/** A pattern's parts with their text accented, an argument as it is. */
function accented(pattern: Pattern): Part[] {
    return pattern.map((part) => {
        if (typeof part === 'string') return accent(part);
        if ('arg' in part) return part;
        return { ...part, cases: Object.fromEntries(Object.entries(part.cases).map(([key, value]) => [key, accented(value)])) };
    });
}

/** A pattern in the pseudo-locale: accented, bracketed and about 40% longer, so that a word left in code, or a layout with no room for a longer language, shows. */
function pseudo(pattern: Pattern): Pattern {
    const out: Part[] = [];
    for (const part of ['[', ...accented(pattern), `${'·'.repeat(Math.round(length(pattern) * 0.4))}]`]) {
        const last = out.at(-1);
        if (typeof part === 'string' && typeof last === 'string') out[out.length - 1] = last + part;
        else out.push(part);
    }
    return out;
}

/** The English, every message and attribute in the pseudo-locale. */
function pseudoLocale(english: Map<string, Compiled>): Map<string, Compiled> {
    const out = new Map<string, Compiled>();
    for (const [id, message] of english) {
        const compiled: Compiled = { ...message, attributes: {} };
        if (message.value) compiled.value = pseudo(message.value);
        for (const [name, pattern] of Object.entries(message.attributes)) compiled.attributes[name] = pseudo(pattern);
        out.set(id, compiled);
    }
    return out;
}

function entries(locale: Map<string, Compiled>): Record<string, { value?: Pattern; attributes?: Record<string, Pattern> }> {
    const out: Record<string, { value?: Pattern; attributes?: Record<string, Pattern> }> = {};
    for (const [id, message] of locale) {
        const entry: { value?: Pattern; attributes?: Record<string, Pattern> } = {};
        if (message.value) entry.value = message.value;
        if (Object.keys(message.attributes).length > 0) entry.attributes = message.attributes;
        out[id] = entry;
    }
    return out;
}

/** The catalog's source, formatted as Biome formats it, and what was wrong with the messages. */
export function generate(): { text: string; problems: string[]; messages: number } {
    const problems: string[] = [];
    const tags = readdirSync(LOCALES, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    const english = compileLocale(SOURCE, problems);
    const catalogs: Record<string, ReturnType<typeof entries>> = { [SOURCE]: entries(english), [PSEUDO]: entries(pseudoLocale(english)) };
    for (const tag of tags.filter((t) => t !== SOURCE && t !== PSEUDO)) {
        const locale = compileLocale(tag, problems);
        checkAgainst(tag, locale, english, problems);
        catalogs[tag] = entries(locale);
    }
    const args = [...english]
        .map(([id, message]) => {
            if (message.args.size === 0) return `    readonly ${JSON.stringify(id)}: undefined;`;
            const fields = [...message.args]
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([name, kind]) => `readonly ${name}: ${kind === 'number' ? 'number' : 'Value'}`);
            return `    readonly ${JSON.stringify(id)}: { ${fields.join('; ')} };`;
        })
        .join('\n');
    const source = [
        '// Generated by scripts/messages.ts from locales/*/*.ftl (`npm run messages`):',
        '// do not edit. A test fails when it is out of date.',
        '',
        `import type { Catalog${args.includes(': Value') ? ', Value' : ''} } from './fluent.ts';`,
        '',
        "/** Each message's arguments, by its identifier. */",
        ...(args ? ['export interface Args {', args, '}'] : ['export type Args = Record<never, never>;']),
        '',
        '/** The messages of each locale, English the source, and the pseudo-locale made from it. */',
        `export const CATALOGS: Readonly<Record<string, Catalog>> = ${JSON.stringify(catalogs)};`,
        '',
    ].join('\n');
    const biome = spawnSync(join(ROOT, 'node_modules/.bin/biome'), ['format', '--stdin-file-path=src/shared/catalog.ts'], {
        input: source,
        encoding: 'utf8',
    });
    if (biome.status !== 0) problems.push(`biome could not format the catalog: ${biome.stderr}`);
    return { text: biome.status === 0 ? biome.stdout : source, problems, messages: english.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { text, problems, messages } = generate();
    if (problems.length > 0) {
        console.error(problems.join('\n'));
        process.exit(1);
    }
    writeFileSync(CATALOG, text);
    console.error(`src/shared/catalog.ts: ${messages} English message(s)`);
}
