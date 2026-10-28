// Your address book as the SignLens API sees it: each contact's address,
// with a stand-in for its name, and the names put back in what the API
// answers before the window shows it or the history keeps it. The engine
// writes a contact's name only into what it says (a label, a warning, a
// summary, the full text), as it was sent, and decides nothing by it: a
// stand-in changes no verdict and no finding, the window reads as it would
// with the names, and none leaves the browser.
//
// A stand-in carries a tag drawn at random for each request, once the
// transaction exists: a transaction that wrote a stand-in into a memo or a
// token's name, to have the window print a contact's name beside an
// address of its own, cannot know it. A tag kept from one request to the
// next would tie them together at the API, as one person's.

import type { Contact } from '../shared/types.ts';

/** A stand-in: its contact's place in the list, from 1, and its request's tag. */
const STAND_IN = /\[\[contact-(\d+)-([0-9a-f]{16})\]\]/g;

/** A tag for one request's stand-ins: 64 random bits, in hex. */
export function randomTag(): string {
    return [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The stand-ins of one request. */
export interface StandIns {
    /** The contacts as the API is sent them: each address with its stand-in. */
    readonly sent: Contact[];
    /** `text` with each of this request's stand-ins as its contact's name, as the window shows it. */
    named(text: string): string;
    /** `text` with each of this request's stand-ins as "a contact", as a rating reports it. */
    unnamed(text: string): string;
}

/** Stand-ins for `contacts`, for one request; `tag` is drawn at random unless a test gives it. */
export function standIns(contacts: Contact[], tag = randomTag()): StandIns {
    // A function, so that a name is put in as written: "$&" in one is not a pattern.
    const swap = (text: string, as: (contact: Contact) => string) =>
        text.replace(STAND_IN, (whole, place: string, of: string) => {
            const contact = of === tag ? contacts[Number(place) - 1] : undefined;
            return contact ? as(contact) : whole;
        });
    return {
        sent: contacts.map((contact, i) => ({ name: `[[contact-${i + 1}-${tag}]]`, address: contact.address })),
        named: (text) => swap(text, (contact) => contact.name),
        unnamed: (text) => swap(text, () => 'a contact'),
    };
}

/** `value` with `swap` applied to each string in it, however deep: an answer the API gave, once read and checked, which is plain data. */
export function eachString<T>(value: T, swap: (text: string) => string): T {
    if (typeof value === 'string') return swap(value) as T;
    if (Array.isArray(value)) return value.map((item: unknown) => eachString(item, swap)) as T;
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, eachString(item, swap)])) as T;
    }
    return value;
}
