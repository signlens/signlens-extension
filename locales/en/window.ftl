### The signing window, which a dapp's request to sign opens before anything
### reaches the wallet (static/confirm.html, ui/confirm.ts), and what every
### window says once its request is gone (ui/windows.ts). The `row-`
### messages below are the extension's words around one row of a request,
### which the window and the popup's history both lay out (ui/render.ts):
### the summary, findings, effects, instructions and full text between
### them are the engine's words, not these.

## The window's title and the lines under it

# The window's title, where the window is listed (the taskbar, the window switcher, what a screen reader says as it opens): the verdict first, then what the site asks ($request: window-heading-transactions or window-heading-message) and the site's host ($site: jup.ag, or window-unknown-page). A message to sign has no verdict.
window-page-title = { $verdict ->
    [ok] OK: { $request } for { $site } · SignLens
    [warning] Warning: { $request } for { $site } · SignLens
    [blocked] Blocked: { $request } for { $site } · SignLens
    [error] Error: { $request } for { $site } · SignLens
   *[message] { $request } for { $site } · SignLens
}
# The window's heading, for a request to sign transactions. $count: how many.
window-heading-transactions = { $count ->
    [one] Sign a transaction
   *[other] Sign { $count } transactions
}
# The window's heading, for a request to sign a message (text, not a transaction).
window-heading-message = Sign a message
# The line under the heading, before the method the site called. $origin: the site's origin (https://jup.ag), its host in bold; or window-unknown-page.
window-where = { $origin } asks you to sign
# Stands in for the site when the page has no origin: in window-where and window-page-title, and in the other windows' lines naming the site.
window-unknown-page = an unknown page

## The band under them: the verdict, and the one-line summary

# The band's summary, when the request has several transactions: $summary is the line of the most serious one (the engine's words, or the extension's for one not explained); $index, which one it is (from 1); $count, how many. Each is shown in full below.
window-band-of-several = { $summary } (transaction { $index } of { $count }; each is below)
# The heading over each of several transactions, before its verdict. $index: which (from 1); $count: how many.
window-transaction-of = Transaction { $index } of { $count }

## Explaining the request again, in another language or after a failure

# A button, when the explanation is in a language other than English: has the request explained again in English and shows that in its place. Nothing is decided by it.
window-show-english = Show in English
# A button, when the explanation was asked for in English and the browser asks for a language the API explains in: has the request explained again in that language. Nothing is decided by it.
window-show-yours = Show in your language
# Beside the Show in English button while the request is explained again.
window-asking-english = Asking for it in English…
# Beside the Show in your language button while the request is explained again.
window-asking-yours = Asking for it in your language…
# A button under a transaction SignLens could not explain: has the request explained again, with the settings as they are now. Nothing is decided by it.
window-try-again = Try again
# Beside the Try again button while the request is explained again.
window-asking-again = Asking again, with the settings as they are now…
# The note above the buttons when Try again or a Show in… button was pressed but the request no longer waits (its page closed or stopped waiting): only Close is left.
window-not-explained-again = This request is no longer pending, so it was not explained again. Ask the site again if you still mean to sign.

## The decision: the note above the buttons, and the buttons

# A button: refuses the request; nothing reaches the wallet, and the window closes. It has the focus as the window opens, so Enter cannot approve; Escape and closing the window refuse too.
window-reject = Reject
# A button: passes the request on to the wallet. Shown only until the window names the wallet (window-continue-to and those after it).
window-continue = Continue
# A button, in Reject's place where nothing can be passed on (SignLens holds no keys, or the request is gone): closes the window, which refuses a request still waiting.
window-close = Close
# A button: passes the request, unchanged, to the wallet named in SignLens's settings, which then asks for its own approval. $wallet: that wallet's name (Phantom).
window-continue-to = Continue to { $wallet }
# A button: as window-continue-to, when the settings name no wallet.
window-continue-to-yours = Continue to your wallet
# A button, on a request SignLens would refuse (blocked, or not explained): asks again first (window-anyway-title), then passes the request on unchanged. $wallet: the wallet's name from the settings.
window-continue-anyway-to = Continue anyway to { $wallet }
# A button: as window-continue-anyway-to, when the settings name no wallet.
window-continue-anyway-to-yours = Continue anyway to your wallet
# The note above the buttons, saying what Continue does. $to says who gets the request: settings, the wallet named in SignLens's settings ($wallet: its name); page, with none named, the first wallet the page has ($wallet: what the page calls it, which SignLens cannot check, so it is quoted as the page's word); none, a wallet no one named.
window-note-continue = { $to ->
    [settings] Continue hands the request unchanged to { $wallet }, which asks for its own approval.
    [page] Continue hands the request unchanged to the first wallet the page has, which it calls “{ $wallet }”, and which asks for its own approval.
   *[none] Continue hands the request unchanged to your wallet, which asks for its own approval.
}
# The note above the buttons, on a request SignLens would refuse (blocked, or not explained), with the setting “Show the explanation and ask first” on. $to and $wallet as in window-note-continue.
window-note-refused = { $to ->
    [settings] SignLens would refuse this. Continuing hands it unchanged all the same to { $wallet }, which asks for its own approval.
    [page] SignLens would refuse this. Continuing hands it unchanged all the same to the first wallet the page has, which it calls “{ $wallet }”, and which asks for its own approval.
   *[none] SignLens would refuse this. Continuing hands it unchanged all the same to your wallet, which asks for its own approval.
}
# As window-note-refused, with that setting off: a request SignLens would refuse is still asked about. “Show the explanation and ask first” is the setting's name in the popup's settings and must read the same. $to and $wallet as in window-note-continue.
window-note-refused-ask-off = { $to ->
    [settings] “Show the explanation and ask first” is off, but SignLens still asks before passing on what it would refuse. Continuing hands this unchanged to { $wallet }, which asks for its own approval.
    [page] “Show the explanation and ask first” is off, but SignLens still asks before passing on what it would refuse. Continuing hands this unchanged to the first wallet the page has, which it calls “{ $wallet }”, and which asks for its own approval.
   *[none] “Show the explanation and ask first” is off, but SignLens still asks before passing on what it would refuse. Continuing hands this unchanged to your wallet, which asks for its own approval.
}
# The note above the buttons in watch-only mode, where SignLens holds no keys and passes nothing on: the only button is Close.
window-note-no-keys = This wallet holds no keys: the request is refused either way.
# The note above the buttons when Continue was pressed but the request no longer waited (its page closed or stopped waiting): nothing reached the wallet, and only Close is left.
window-not-passed-on = Nothing was passed on: this request was no longer pending. Ask the site again if you still mean to sign.
# The note above the buttons in every window when the yes was pressed and SignLens's background never answered: whether it went through is not known. “The popup's requests”: the list of requests in SignLens's toolbar popup.
window-no-answer = SignLens did not answer, so it is not known whether this went through: the popup's requests say what came of it.

## The question the Continue anyway button asks first, on a request SignLens would refuse

# The question's heading.
window-anyway-title = Pass this request on anyway?
# Under the question: why SignLens would refuse a transaction it explained. $why: its most serious finding, or else its summary, in the explanation's words.
window-refusal-blocked = SignLens blocks it. { $why }
# Under the question: why SignLens would refuse a transaction it could not explain.
window-refusal-unexplained = SignLens could not explain this, so nothing is known of what it does.
# Under the question, for one of several transactions: $why is window-refusal-blocked or window-refusal-unexplained; $index, which transaction (from 1); $count, how many.
window-refusal-of-several = { $why } (transaction { $index } of { $count })
# A button: closes the question; nothing is passed on and the request still waits. It has the focus, so Enter goes back.
window-anyway-back = Go back
# A button: passes the request on to the wallet in spite of SignLens's refusal.
window-anyway-go = Continue anyway

## A window whose request is gone (every window)

# The window's title.
window-gone-page-title = No longer pending · SignLens
# The heading of a window opened on a request already gone, in place of the request.
window-gone-heading = No longer pending
# Under that heading.
window-gone-text = This request is no longer pending: its page closed, reloaded or stopped waiting. Nothing came of it.

## The feedback strip under the explanation

# Heads the three rating buttons.
window-feedback-ask = Was this explanation clear?
# A rating button: sends the rating at once.
window-rating-clear = Clear
# A rating button: opens a box for a comment; the rating goes with the decision.
window-rating-unclear = Unclear
# A rating button: opens a box for a comment; the rating goes with the decision.
window-rating-wrong = Wrong
# Under the ratings: what a rating sends.
window-feedback-what = A rating sends SignLens the site, SignLens's version, what this window shows (the verdict, the findings and the programs called) and your comment. The transaction itself goes only if you tick the box below.
# As window-feedback-what, in Firefox, which asks once whether a rating may carry the site and the version.
window-feedback-what-firefox = A rating sends SignLens what this window shows (the verdict, the findings and the programs called) and your comment, and the site and SignLens's version once you allow them when Firefox asks. The transaction itself goes only if you tick the box below.
# A checkbox's label: sends the transaction itself with the rating. $count: how many transactions the window explained.
window-feedback-cover = { $count ->
    [one] Send this transaction to SignLens so it can be looked into
   *[other] Send these transactions to SignLens so they can be looked into
}
# The comment box, shown after Unclear or Wrong: its placeholder, and its name for a screen reader.
window-feedback-comment =
    .placeholder = What was unclear or wrong? (optional)
    .aria-label = What was unclear or wrong? (optional)
# The strip's status after Unclear or Wrong: the comment goes with the decision.
window-feedback-add-word = Add a word if you like; it is sent when you decide below.
# The strip's status once the rating was sent.
window-feedback-sent = Thank you. Sent to SignLens.
# The strip's status when the rating could not be sent.
window-feedback-failed = The feedback could not be sent.

## A row of a request: the headings and toggles of a transaction explained

# Heads the summaries of a transaction's actions, one line each below it. $count: how many (more than one).
row-actions = { $count ->
    [one] { $count } action
   *[other] { $count } actions
}
# The heading over the findings: what SignLens found wrong, or worth knowing.
row-findings-title = What SignLens found
# The heading over the effects: what the transaction does.
row-effects-title = What this does
# A finding's severity, on a badge before it.
row-severity-info = Info
row-severity-warning = Warning
row-severity-high = High
row-severity-critical = Critical
# The toggle over the instructions and the rest of the details. $count: how many instructions.
row-instructions-toggle = { $count ->
    [0] Details
    [1] Instruction and details
   *[other] Instructions ({ $count }) and details
}
# The toggle over the details after the instructions. $sections: their titles, in the engine's words, joined by row-list-separator.
row-details-toggle = Details: { $sections }
# An inner step's title. $index: its number among the transaction's instructions and steps (from 1); $title: the engine's title for it.
row-step = Step { $index }: { $title }
# The toggle over the engine's full text, laid out as the engine prints it.
row-full-text = Full text, as the engine prints it
# Joins the items of a list: section titles, addresses, token symbols.
row-list-separator = {", "}

## Trust: the marker on a value, and the help it opens

# After a value that came from the site or the RPC rather than the transaction: a button that opens row-help-claimed. As the engine's own text marks it.
row-claimed = (claimed, unverified)
# The name, for a screen reader, of the badge (a drawn check) on a verified value.
row-verified = verified
# The help a verified value's badge opens.
row-help-verified = This name comes from SignLens or from you: its reviewed descriptors, its verified token list, your addresses in its settings, or your address book. The site could not have supplied it.
# The help the (claimed, unverified) marker opens.
row-help-claimed = This came from the site or from the RPC the extension asked, not from the transaction itself. SignLens could not check it, so do not rely on it.
# The help the marker on a whole section of claims (the simulated outcome) opens.
row-help-claims = Everything in this section came from the RPC the extension asked, not from the transaction itself. SignLens could not check it, so treat it as a hint, not a fact.

## Values: where the engine sends no words for them, the extension's

# An amount in a token's smallest units, its decimals not known. $units: the number, its digits grouped as the engine writes them; $count: the same number, which picks the form.
row-raw-units = { $count ->
    [1] { $units } raw unit
   *[other] { $units } raw units
}
# A duration of a day or more: its days, and its hours unless none.
row-duration-days = { $days ->
    [1] { $days } day
   *[other] { $days } days
}{ $hours ->
    [0] {""}
    [1] { " " }{ $hours } hour
   *[other] { " " }{ $hours } hours
}
# A duration of an hour or more, under a day: its hours, and its minutes unless none.
row-duration-hours = { $hours ->
    [1] { $hours } hour
   *[other] { $hours } hours
}{ $minutes ->
    [0] {""}
    [1] { " " }{ $minutes } minute
   *[other] { " " }{ $minutes } minutes
}
# A duration of a minute or more, under an hour: its minutes, and its seconds unless none.
row-duration-minutes = { $minutes ->
    [1] { $minutes } minute
   *[other] { $minutes } minutes
}{ $seconds ->
    [0] {""}
    [1] { " " }{ $seconds } second
   *[other] { " " }{ $seconds } seconds
}
# A duration under a minute.
row-duration-seconds = { $seconds ->
    [1] { $seconds } second
   *[other] { $seconds } seconds
}
# A yes-or-no value.
row-yes = yes
row-no = no
# A value of a type this version does not know. $type: the type's name in the explanation.
row-unrecognized-value = A value this version cannot show ({ $type }); the full text below has it
# A button under long bytes, folded to two lines: shows them all. $count: how many bytes.
row-bytes-show-all = { $count ->
    [one] show all { $count } byte
   *[other] show all { $count } bytes
}
# The same button once they show: folds them again.
row-bytes-show-less = show less
# An amount of a token with a symbol, from an engine that words none itself. $symbol: the token's symbol (USDC); $quantity: the amount, its digits as the engine writes them; $bound: whether the amount is exact, at least or at most that, unlimited, or not known.
row-amount-symbol = { $bound ->
    [at_least] ≥ { $quantity } { $symbol }
    [at_most] ≤ { $quantity } { $symbol }
    [unlimited] UNLIMITED { $symbol }
    [unknown] an unknown amount of { $symbol }
   *[exact] { $quantity } { $symbol }
}
# As row-amount-symbol, for a token without a symbol. $token: row-unverified-token, or the engine's words for the token.
row-amount-token = { $bound ->
    [at_least] ≥ { $quantity } of { $token }
    [at_most] ≤ { $quantity } of { $token }
    [unlimited] an UNLIMITED amount of { $token }
    [unknown] an unknown amount of { $token }
   *[exact] { $quantity } of { $token }
}
# A token with no symbol and no description. $mint: its address, shortened (HMYd…pump).
row-unverified-token = unverified token { $mint }
# An amount's note, after the amount, with the space before it, from an engine that sends the note without its brackets. $note: the engine's words.
row-amount-note = { " " }({ $note })
# An address with a label, from an engine that words neither. $label: the label, in bold; $address: the address, shortened.
row-labelled-address = { $label } ({ $address })

## A row of a request: a transaction not explained, a message, and requests that are not a transaction

# Over a transaction SignLens could not explain, in the window, which offers Try again.
row-not-explained = SignLens could not explain this transaction: nothing is known of what it does.
# The same in the popup's list of requests, which cannot ask again itself.
row-not-explained-ask-again = SignLens could not explain this transaction: nothing is known of what it does. To try again, Reject and ask the site again.
# Over a message (text, not a transaction) a site asks to sign, shown as it is.
row-message-unchecked = SignLens does not check messages: this one is shown as it is. Sign it only if you mean what it says.
# Under a site's request to see the watched address, in the popup's list of requests. Revoke: the button's label in the popup's settings.
row-consent-where = The sites allowed to see the watched address are listed in the settings, where Revoke takes one back.
# Above the addresses a page named as the reader's, which SignLens does not know as theirs.
row-address-claimed = The page named as yours an address that is not one of yours in SignLens:
# Under those addresses.
row-address-refused = The request was refused before anything was explained or sent anywhere.

## A row of a request: what was read besides the transaction, and saving it

# $chain: the chain the page named, when not mainnet (solana:devnet).
row-chain = Chain: the page says { $chain }; read and simulated on the RPC in the settings all the same
# $tables: what came of reading the transaction's lookup tables.
row-tables = Lookup tables: { $tables }
# $simulation: what the simulation found, or that it was not run, and why.
row-simulation = Simulation: { $simulation }
# $accounts: the accounts' addresses, joined by row-list-separator.
row-accounts = Accounts read from the RPC, unverified: { $accounts }
# $tokens: the tokens' symbols, joined by row-list-separator.
row-hints = Unlisted tokens named from the RPC and the token list, unverified: { $tokens }
# A link that saves the transaction to a file.
row-save = Save the transaction
# As row-save, for one of a request's several transactions. $part: which (from 1).
row-save-numbered = Save transaction { $part }
# The save link's tooltip.
row-save-title = The transaction with its lookup tables, as the SignLens engine reads it
