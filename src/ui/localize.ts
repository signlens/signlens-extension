// The interface's words laid out in a page: a message's inline markup made
// into the elements it names, never parsed as HTML, and every element a
// page marks with `data-l10n-id` worded when the page loads.

import { MARKUP, type Piece, pieces, plain, shown } from '../shared/fluent.ts';
import { type ArgsOf, argsOf, type Id, interfaceLocale, lookup } from '../shared/words.ts';

/** The attributes a message may set on the element it words. */
const ATTRIBUTES = new Set(['title', 'aria-label', 'placeholder', 'alt']);

/** `worded` as nodes: its markup the elements it names, a named link a copy of the page's, an argument's node where it stands. */
function build(worded: readonly Piece[], locale: string, links: ReadonlyMap<string, Element>): DocumentFragment {
    const root = document.createDocumentFragment();
    const stack: ParentNode[] = [root];
    const top = (): ParentNode => stack.at(-1) ?? root;
    for (const piece of worded) {
        if ('value' in piece) {
            top().append(typeof piece.value === 'object' ? piece.value : shown(piece.value, locale));
            continue;
        }
        let at = 0;
        for (const match of piece.text.matchAll(MARKUP)) {
            top().append(piece.text.slice(at, match.index));
            at = match.index + match[0].length;
            const [, closing, tag = 'span', name] = match;
            if (closing) {
                if (stack.length > 1) stack.pop();
                continue;
            }
            const named = name ? links.get(name) : undefined;
            const made = named ? (named.cloneNode(false) as Element) : document.createElement(tag);
            top().append(made);
            stack.push(made);
        }
        top().append(piece.text.slice(at));
    }
    return root;
}

/** `id`'s words as nodes, its markup and all, for an element to hold. */
export function nodes<K extends Id>(id: K, ...args: ArgsOf<K>): DocumentFragment {
    const { entry, locale } = lookup(id);
    return build(pieces(entry.value ?? [], argsOf(args), locale), locale, new Map());
}

/** Words `element` by its `data-l10n-id`: its content, the links it names (`data-l10n-name`) kept as templates, and the attributes the message sets. */
export function word(element: Element): void {
    const id = element.getAttribute('data-l10n-id') as Id | null;
    if (!id) return;
    const { entry, locale } = lookup(id);
    if (entry.value) {
        const links = new Map(
            [...element.querySelectorAll('[data-l10n-name]')].map((link) => [link.getAttribute('data-l10n-name') ?? '', link]),
        );
        element.replaceChildren(build(pieces(entry.value, {}, locale), locale, links));
    }
    for (const [name, pattern] of Object.entries(entry.attributes ?? {}))
        if (ATTRIBUTES.has(name)) element.setAttribute(name, plain(pieces(pattern, {}, locale), locale));
}

/** Words every element under `root` that names a message, and marks the page with the interface's language. */
export function localize(root: ParentNode = document): void {
    document.documentElement.lang = interfaceLocale();
    for (const element of root.querySelectorAll('[data-l10n-id]')) word(element);
}
