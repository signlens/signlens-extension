// The reader's languages, as the API takes them (ADR-0015, decision 9): the
// browser's, in its order of preference. The engine words the explanation
// in the first it has, and in English when it has none of them.

/** Most locales a request may name, as the engine takes them. */
const MAX_LOCALES = 8;
/** A BCP 47 tag as the engine matches it: letters, digits and dashes. */
const TAG = /^[A-Za-z0-9-]{1,35}$/;

/** The browser's languages, each once, as BCP 47 tags, at most eight. */
export function readerLocales(languages: readonly string[] = navigator.languages): string[] {
    return [...new Set(languages.filter((tag) => TAG.test(tag)))].slice(0, MAX_LOCALES);
}
