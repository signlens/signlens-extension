// The access to sites the settings need (endpoint.ts): every https site,
// and this machine only for an endpoint on it. Chrome grants the
// manifest's whole list at install; Firefox shows it then too, but it can
// be turned off, and asking again takes a click on one of SignLens's own
// pages: the popup, or the setup page.

import { hostsNeeded } from '../shared/endpoint.ts';
import { ENDPOINTS, settings } from '../shared/settings.ts';

/** The origins the settings need, what the button that asks for them says, and whether the browser grants them. */
export async function access(): Promise<{ hosts: { origins: string[] }; label: string; granted: boolean }> {
    const config = await settings();
    const hosts = { origins: hostsNeeded(ENDPOINTS.map((name) => config[name])) };
    let granted = true;
    try {
        granted = await chrome.permissions.contains(hosts);
    } catch {
        // No permissions API: nothing to ask for.
    }
    return { hosts, label: hosts.origins.length > 1 ? 'Allow https and local access' : 'Allow https access', granted };
}
