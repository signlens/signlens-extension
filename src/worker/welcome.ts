// The setup page (welcome.html), which a new install opens: where your
// addresses go before any site asks about one, and how SignLens is used.

/** What the browser says of an install, as far as the setup page cares: Firefox adds `temporary` for an add-on loaded for a moment. */
export interface Installed {
    reason: string;
    previousVersion?: string | undefined;
    temporary?: boolean | undefined;
}

/** Whether `details` call for the setup page: a new install, not an update of either kind, nor a copy a developer loaded for a moment. */
export function opensSetup(details: Installed): boolean {
    return details.reason === 'install' && details.temporary !== true;
}
