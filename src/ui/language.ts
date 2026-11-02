// The language select at the top of the popup's settings: the browser's
// languages, the default, or one the interface is worded in, each named
// in itself, for SignLens's own words and its explanations alike
// (words.ts). A choice saved reloads the page, which words itself in it;
// the worker follows it as it is saved.

import { local } from '../shared/store.ts';
import { describe } from '../shared/text.ts';
import { chooseLocale, interfaceLanguages, t } from '../shared/words.ts';

/** `tag` named in its own language ("English", "简体中文"), or the tag where the browser has no name for it. */
function autonym(tag: string): string {
    try {
        return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
    } catch {
        return tag;
    }
}

/** A choice of the select: `value` saved, `text` shown, in `lang` where it names a language in itself. */
function option(value: string, text: string, lang?: string): HTMLOptionElement {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    if (lang) node.lang = lang;
    return node;
}

/**
 * Fills `select` with the choices, the browser's languages first, naming
 * the language they give, and shows `chosen`, the one saved; a new choice
 * is saved, and the page reloaded in it, or `status` says why it was not.
 */
export function languageField(select: HTMLSelectElement, status: HTMLElement, chosen: string): void {
    const languages = interfaceLanguages();
    select.replaceChildren(
        option('', t('language-browser', { language: autonym(chooseLocale(navigator.languages)) })),
        ...languages.map((tag) => option(tag, autonym(tag), tag)),
    );
    select.value = languages.includes(chosen) ? chosen : '';
    select.addEventListener('change', async () => {
        try {
            await local.set({ language: select.value });
            location.reload();
        } catch (error) {
            status.textContent = t('language-not-saved', { error: describe(error) });
        }
    });
}
