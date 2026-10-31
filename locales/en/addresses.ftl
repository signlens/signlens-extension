### Your addresses, as the popup's settings and the setup page edit them
### (ui/yours.ts), and the button that asks for the access SignLens needs
### (ui/access.ts), which both pages show.

## The list of your addresses, and the field that adds one

# Names the list of your addresses for screen readers.
yours-list-label = Your addresses
# In place of the list while it is empty.
yours-none = None yet.
# What the field that adds an address says while it is empty.
yours-input-placeholder = Paste an address from your wallet
# Names the field that adds an address for screen readers.
yours-input-label = Add an address
# The button that adds what the field holds.
yours-add = Add
# The button on each address's row that takes it out of the list.
yours-remove = Remove
# Names a row's Remove button for screen readers. $address: the address, in full.
yours-remove-label = Remove { $address }
# Under the list when it holds more addresses than a request carries. $max: how many it carries.
yours-limit = A request carries { $max } of these: those the site names, then the first in the list.

## What became of an add or a remove, under the field

# $error: why the browser did not keep the change, as it says it.
yours-not-removed = Not removed: { $error }
# $address: the address taken out, shortened (7s3s…L7Qp).
yours-removed = Removed { $address }.
yours-empty = Paste an address first.
# $error: why the browser did not keep the change, as it says it.
yours-not-added = Not added: { $error }
# $words: what the field held that is not an address, each cut short, separated by yours-list-separator.
yours-not-address = Not a Solana address: { $words }.
# $addresses: the addresses added, shortened (7s3s…L7Qp), separated by yours-list-separator.
yours-added = Added { $addresses }.
yours-already = Already in your list.
# Between the items of a list of addresses, or of words that are not addresses.
yours-list-separator = { ", " }

## The button that asks the browser for the access SignLens needs

# Asks for access to every https site.
access-allow = Allow https access
# Asks for access to every https site, and to this machine, where an address in the settings is on it.
access-allow-local = Allow https and local access
