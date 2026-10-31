### The toolbar popup (static/popup.html, ui/popup.ts, ui/pages.ts): the
### requests a site made, the settings, and whether the API answers.

## The header: the API's status, the access SignLens needs, and your address

# The status line while the popup asks the API whether it answers.
popup-checking = Checking the SignLens API…
# The status line when the API's address in the settings is not one SignLens may call (plain http to another machine, say).
popup-engine-unsafe = SignLens API not used: its address in the settings is not one SignLens may call.
# $error: why the API did not answer, as the browser or the API says it.
popup-engine-down = SignLens API not reachable: { $error }
# $engine: the engine's version (0.3.0); $programs: how many programs it describes; $tokens: how many tokens it knows as verified; $languages: the sentence on the languages it explains in (popup-languages).
popup-engine-ready = SignLens API ready: engine { $engine }, { $programs } programs, { $tokens } verified tokens. { $languages }
# Ends the status line: the languages the API explains in. $count: how many besides English; $languages: each of them (popup-language), separated by popup-languages-separator.
popup-languages = { $count ->
    [0] Explains in English.
   *[other] Explains in English, and in { $languages }, when your browser asks for it.
}
# One language the API explains in. $language: its name (popup-language-named), or its code where the browser has no name for it; $review: reviewed or not; $on: the day it was reviewed (2026-11-02).
popup-language = { $review ->
    [reviewed] { $language }, reviewed on { $on }
   *[other] { $language }, not reviewed
}
# $name: a language's name in the browser's language (Simplified Chinese); $tag: its code (zh-Hans).
popup-language-named = { $name } ({ $tag })
# Between two languages in popup-languages.
popup-languages-separator = { "; " }
# Shown when the browser has not let SignLens reach the sites it needs; a button that asks for that access follows it.
popup-permissions = This browser has not let the extension reach the API, the RPC and the token list yet.
# Over the requests while pass-through mode has none of your addresses; a field to add one follows.
popup-setup-ask = Add the address your wallet shows, so SignLens need not ask which is yours.
# In place of popup-setup-ask once an address was added there.
popup-setup-added = Added. SignLens calls it “you” from now on; your addresses are in the settings.

## The two views, as tabs

# Names the row of tabs for screen readers.
popup-views =
    .aria-label = Views
popup-tab-requests = Requests
popup-tab-settings = Settings
# After the Requests tab's name: how many requests came since the popup was last open. $count: that number.
popup-unseen = { $count } new

## The requests

# Over the list of requests.
popup-newest-first = Newest first
# The button that empties the list of requests.
popup-clear = Clear
    .aria-label = Clear requests
popup-clear-failed = The requests could not be cleared; try again.
# “SignLens” is the wallet's name in the dapp's list of wallets.
popup-empty = None yet. Connect “SignLens” in a dapp and start a transaction.
# In place of a verdict, on a row where a site asked to see the watched address.
popup-verdict-connect = connect
# What became of a request, beside its verdict: SignLens refused it (the page closed, say).
popup-decision-refused = refused
# What became of a site's request to see the watched address.
popup-decision-allowed = allowed
popup-decision-denied = denied
# A request in watch-only mode, which passes nothing on to a wallet.
popup-decision-watch-only = watch-only
# Passed on to your wallet, after you chose to in SignLens's window.
popup-decision-passed-on = passed on
# Passed on to your wallet without SignLens's window asking you (its “ask first” setting off).
popup-decision-passed-on-unasked = passed on, not asked
# You rejected it in SignLens's window.
popup-decision-rejected = rejected
# Under a request SignLens refused. $reason: why, a lowercase clause (“the page closed or reloaded”).
popup-refused = Refused by SignLens: { $reason }

## The settings: what happens to a request

popup-not-saved = Not saved: { $error }
popup-mode-legend = After explaining a request
popup-mode-pass = <strong>Pass it to your wallet</strong> to sign, unchanged
popup-mode-watch = <strong>Refuse it</strong> (watch-only, no keys involved)
popup-upstream-label = Wallet to pass requests to
# The first choice of the wallet to pass requests to: whichever wallet the dapp's page has first.
popup-upstream-first = First one found
# A wallet chosen before that the page in the current tab does not have. $wallet: its name.
popup-upstream-elsewhere = { $wallet } (not on this page)
# Under the wallet choice. $site: the page's host (jup.ag); $wallets: the wallets it has, separated by popup-list-separator.
popup-upstream-found = Found on { $site }: { $wallets }.
# As popup-upstream-found, for a page whose host is not known.
popup-upstream-found-here = Found on this page: { $wallets }.
popup-upstream-none = No other wallet found. Open a dapp, then come back here.
popup-no-wallet-elsewhere = SignLens does not run on this page. Open a dapp (an https page), then open this popup again.
popup-no-wallet-reload = SignLens is not running in this tab yet. Reload the tab (needed once after installing or updating SignLens), then open this popup again.
popup-no-wallet-page = No other wallet found in this tab. Open a dapp, then come back here.
# Between the items of a list: wallet names, line numbers.
popup-list-separator = { ", " }

## The settings: your addresses, and the address watch-only mode connects as

popup-yours-title = Your addresses
# “you”: the explanations' word for the reader. The quoted words are the name of the choice popup-ask-first-name.
popup-yours-note = The only addresses SignLens calls “you”. When a site names another as yours, SignLens asks before explaining anything, or, with “Show the explanation and ask first” off, refuses it; copy them from your wallet.
popup-address-label = Address to connect as
popup-address-field =
    .placeholder = Any Solana address
popup-address-bad = Not a Solana address (base58 of 32 bytes).
popup-sites-title = Sites that may see it
popup-sites-empty = None yet: a site asks the first time it connects.
# The button that takes back a site's access to the watched address.
popup-revoke = Revoke
# Names the Revoke button for screen readers. $site: the site's host; $address: the watched address, shortened (7s3s…L7Qp).
popup-revoke-label = Revoke { $site } for { $address }
popup-revoke-failed = { $site } could not be revoked; try again.
# Beside a site allowed to see an address other than the one in the settings.
popup-other-address = another address

## The settings: the choices, each named by its bold words (…-name) and described by the rest of its line (…-more)

# A choice's line: $name, its name in bold (popup-ask-first-name), then $more, what it does (popup-ask-first-more).
popup-ask-first = { $name }, { $more }
popup-ask-first-name = Show the explanation and ask first
popup-ask-first-more = before refusing or passing a request on; when off, in pass-through mode a request SignLens would refuse (blocked, or an error) still waits for you before it goes on to your wallet
# A choice's line: $name, its name in bold (popup-simulate-name), then $more, what it does (popup-simulate-more).
popup-simulate = { $name } { $more }
popup-simulate-name = Simulate over the RPC
popup-simulate-more = and hold the balance changes against the explanation, as an unverified claim; sends the whole transaction to the RPC
# A choice's line: $name, its name in bold (popup-accounts-name), then $more, what it does (popup-accounts-more).
popup-accounts = { $name } { $more }
popup-accounts-name = Read the accounts an explanation needs
popup-accounts-more = such as a multisig proposal's stored transaction or a DAO proposal's options, from the RPC, as unverified claims; sends their addresses to the RPC
# A choice's line: $name, its name in bold (popup-tokens-name), then $more, what it does (popup-tokens-more).
popup-tokens = { $name } { $more }
popup-tokens-name = Name unlisted tokens
popup-tokens-more = from the RPC's mint accounts and the token list below, as unverified claims

## The settings: the address book

# “Name = address” is the form of each line the field reads.
popup-contacts-label = Address book, one <code>Name = address</code> per line
# An example line of the address book: a name, then an address, shortened.
popup-contacts-field =
    .placeholder = Bob = 7s3s…
# $count: how many lines were not read; $lines: their numbers, separated by popup-list-separator.
popup-contacts-bad = { $count ->
    [one] Line { $lines } not read: expected Name = address.
   *[other] Lines { $lines } not read: expected Name = address.
}
# $max: how many contacts are used; $count: how many lines are past them; $lines: their numbers, separated by popup-list-separator.
popup-contacts-over = { $count ->
    [one] Only the first { $max } contacts are used; line { $lines } not.
   *[other] Only the first { $max } contacts are used; lines { $lines } not.
}
# Both of the address book's problems at once: $bad is popup-contacts-bad, $over popup-contacts-over.
popup-contacts-both = { $bad } { $over }

## The settings: the API, the RPC and the token list

popup-api-label = SignLens API
# The quoted words are the box under an explanation that sends its transaction with a rating.
popup-api-note = Beta: every transaction you are asked to sign is sent here to be explained, with your addresses and those in your address book, so the explanation can say “you” and tell your contacts from lookalikes; their names stay in your browser. The server keeps verdicts and finding codes, not the bytes; the transaction is kept only when you tick “Send this transaction to SignLens so it can be looked into” under its explanation.
popup-rpc-label = RPC for lookup tables, accounts, mints and simulation
popup-token-list-label = Token list (symbols)
popup-token-list-note = The mints of unlisted tokens are sent to the RPC and to this list.
# Under an address SignLens does not use. $problem: what is wrong with it, a lowercase clause (“not a URL”); $kept: the address SignLens uses instead.
popup-endpoint-kept = Not used: { $problem }. SignLens keeps using { $kept }.
# Under an address SignLens does not use, with none to use instead. $problem: what is wrong with it, a lowercase clause (“not a URL”); $endpoint: which field it is.
popup-endpoint-none = { $endpoint ->
    [apiUrl] Not used: { $problem }. SignLens asks no API until it is fixed.
    [rpcUrl] Not used: { $problem }. SignLens asks no RPC until it is fixed.
   *[tokenApiUrl] Not used: { $problem }. SignLens asks no token list until it is fixed.
}
popup-setup-again = Open the setup page
