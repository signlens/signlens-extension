// The pages' elements, found by id and checked for what they are: a page
// whose markup lost an element, or has another kind under its id, fails
// at once and by name, rather than wherever the wrong element is used.

/** The element with `id`: an HTMLElement, or the `kind` asked for. */
export function byId(id: string): HTMLElement;
export function byId<T extends HTMLElement>(id: string, kind: { new (): T; prototype: T }): T;
export function byId(id: string, kind: { new (): HTMLElement; prototype: HTMLElement } = HTMLElement): HTMLElement {
    const node: Element | null = document.getElementById(id);
    if (!(node instanceof kind))
        throw new Error(`SignLens: #${id} is ${node ? `a <${node.tagName.toLowerCase()}>` : 'missing'}, not ${kind.name}`);
    return node;
}
