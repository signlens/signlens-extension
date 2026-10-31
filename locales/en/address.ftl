### The window asking whether an address a page names as yours is yours,
### before a request is explained (static/address.html, ui/address.ts).

# The window's title. $site: the page's host, without its scheme (jup.ag).
address-window-title = Is this address yours? { $site } · SignLens
address-heading = Is this address yours?
# The line under the heading. $origin: the page's origin (https://jup.ag), its host in bold; or words for a page not known.
address-where = { $origin } asks you to sign with an address SignLens does not know as yours

## The address the page names, and the reader's own

# Above the address the page names, shown in full.
address-claimed-intro = The page says the wallet that signs this request has the address:
# Above the list of the addresses the reader has given SignLens as theirs.
address-mine-title = Your addresses in SignLens:
# In place of that list when it is empty.
address-mine-empty = None yet.
address-warning = Add it only if your wallet shows exactly this address. A site that wants you to send to its own address can tell SignLens that address is yours, and the transfer would then read as one between your own accounts.

## The answers

address-note = Nothing has been explained or sent anywhere yet.
# Refuses the request; it has the focus, and Escape presses it.
address-reject = Reject
# Adds the address to the reader's addresses, and the request goes on to be explained.
address-add = It's mine, add it
# In place of the note, when the address was confirmed after the site stopped waiting.
address-not-added = The address was not added: this request was no longer pending. Ask the site again if you still mean to sign.
