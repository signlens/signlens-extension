### A request's row summed up in one line: what the window's band and a row
### of the popup's history lead with (shared/verdict.ts). A transaction the
### engine explained leads with the engine's own summary instead.

# A transaction SignLens could not explain. $error: why, in SignLens's words or the API's, starting in lowercase (“the SignLens API at … did not answer (…)”).
verdict-not-explained = Not explained: { $error }
# A message a site asks to sign, which SignLens shows as it is, without explaining it.
verdict-message = A message, shown as it is
# In watch mode, a site asked to see the address SignLens watches. $address: that address.
verdict-consent = Asked to see the watched address { $address }
# A request refused before it was explained: the site named, as the reader's own, an address that is not among the reader's addresses in SignLens's settings. $addresses: that address, or several, separated by verdict-list-separator.
verdict-address = Named { $addresses } as your address, which is not one of yours in SignLens
# Between the addresses in verdict-address.
verdict-list-separator = { ", " }
