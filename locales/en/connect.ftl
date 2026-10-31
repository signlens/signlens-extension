### The window a site's first connect in watch mode opens, asking to let
### the site see the address SignLens watches (static/connect.html,
### ui/connect.ts).

# The window's title. $site: the site's host, without its scheme (jup.ag).
connect-window-title = { $site } asks to see the watched address · SignLens
connect-heading = Connect watch-only
# The line under the heading. $origin: the site's origin (https://jup.ag), its host in bold; or words for a page not known.
connect-where = { $origin } wants to see the address SignLens watches

## The address, and what each answer does

# Above the watched address, shown in full.
connect-address-intro = The address SignLens connects as:
connect-aside = Allow lets this site see it whenever it connects; you can take this back in SignLens's settings. Deny refuses this time only: the site asks again the next time it connects. Nothing can be signed with the address either way: SignLens holds no keys.

## The question and the answers

connect-question = Let this site see the address?
# Refuses this time only; it has the focus, and Escape presses it.
connect-deny = Deny
# Lets the site see the watched address whenever it connects.
connect-allow = Allow
# In place of the question, when Allow was pressed after the site stopped waiting.
connect-not-allowed = The site was not allowed: this request was no longer pending. Connect again from the site if you still mean to.
