// JSON from elsewhere, read for what it holds rather than cast to what it
// should: an object's fields, or nothing when it is not an object.

/** The fields of `value` when it is a plain object (not an array, not null), else `null`. */
export function objectFields(value: unknown): Readonly<Record<string, unknown>> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
