### The window asking which wallet signs, when a page that has several
### connects SignLens with none chosen in the settings (static/wallet.html,
### ui/wallet.ts).

# The window's title until it knows the page asking.
wallet-page-title = Which wallet signs? · SignLens
# The window's title. $site: the page's host, without its scheme (jup.ag).
wallet-window-title = Which wallet signs? { $site } · SignLens
wallet-heading = Which wallet signs?
# The line under the heading. $origin: the page's origin (https://jup.ag), its host in bold; or words for a page not known.
wallet-where = { $origin } asks to connect

## The wallets, each a button by the name and icon it gives itself

wallet-intro = This page has more than one wallet. SignLens passes your requests on to the one you choose here, and keeps your choice; its popup's settings change it.
# The list of the wallets' buttons, as a screen reader names it.
wallet-list =
    .aria-label = Wallets on this page
wallet-aside = Each name and icon is the one the wallet gives itself in this page. The wallet you choose asks to connect, as it always does.

## The answers

wallet-note = Nothing is connected until you choose.
# Chooses no wallet, and the connect is refused; it has the focus, and Escape presses it.
wallet-cancel = Cancel
# In place of the note, when a wallet was chosen after the site stopped waiting.
wallet-not-connected = No wallet was connected: this request was no longer pending. Connect again from the site.
# In place of the note, when the choice could not be saved. $error: why, in the browser's words.
wallet-not-kept = Not kept: { $error }
