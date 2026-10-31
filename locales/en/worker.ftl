### The words the background worker and the shared modules give the
### extension's own pages: the toolbar badge, the notes and failures a
### request's row keeps for the window and the popup, and why an address in
### the settings or the API's status is no good, and why SignLens refused a
### request. What goes back to a dapp is always in English, for its
### developers: where the reader sees the same reason, it is a message here,
### and the dapp is told the message's English.

## The toolbar badge: the worst verdict among the requests the popup has not shown yet (worker/history.ts). The badge has room for about 4 characters: keep each to at most 4.

# Explained, and SignLens found nothing to warn of.
worker-badge-ok = OK
worker-badge-warning = WARN
# The English, at 5 characters, is the one past the limit.
worker-badge-blocked = BLOCK
# A request SignLens could not explain: nothing is known of what it does.
worker-badge-error = ?
# A message to sign, which has no verdict.
worker-badge-message = MSG

## A transaction's lookup tables, shown after “Lookup tables:” under its row (worker/tables.ts)

# The transaction could not be read far enough to find its lookup tables. $error: why (one of the worker-tx- messages, or the browser's words).
worker-tables-not-parsed = not parsed ({ $error })
# The addresses the tables load were read from the RPC in the settings: what it says is a claim SignLens cannot check.
worker-tables-read =
    { $count ->
        [one] { $count } lookup table
       *[other] { $count } lookup tables
    } read over RPC, unverified
# $error: why the tables could not be read (an RPC's answer, or a worker-table- message).
worker-tables-not-resolved =
    { $count ->
        [one] { $count } lookup table
       *[other] { $count } lookup tables
    } not resolved ({ $error })

## The simulation of a transaction over the RPC, shown after “Simulation:” under its row (worker/explain.ts)

worker-simulation-not-parsed = not run (transaction not parsed)
# $error: why the RPC could not be asked (its answer, or a worker-rpc- message).
worker-simulation-unavailable = not run ({ $error })
# The transaction would fail on chain.
worker-simulation-failed = failed
# $count: how many balances the simulation says would change; “(s)” leaves the count's plural open, as the English has it.
worker-simulation-changes = { $count } balance change(s), unverified

## Why a transaction of a request was not explained: its row in the window and the popup, after “Not explained:” (worker/explain.ts, worker/api.ts)

# The API refused a transaction for its rate limit, so the ones after it were not asked for either. $at: the first transaction refused, counted from 1; $count: how many the request holds.
worker-limited = not explained: the SignLens API took no more explanations for now, from transaction { $at } of { $count } on; try again in a minute
worker-api-error-unsaid = the SignLens API answered an error without a message
# $url: the API's address, as the settings have it; $error: the browser's words for the failure.
worker-api-no-answer = the SignLens API at { $url } did not answer ({ $error })
# The API is older than this version of the extension. $url: its address. /v2/explain is the path asked for, as it is.
worker-api-no-v2 = the SignLens API at { $url } does not serve /v2/explain, which this version needs: update it, or use the default API in the settings
# $status: the HTTP status code (503).
worker-api-not-explanation = the SignLens API answered HTTP { $status } with something that is not an explanation
# $status: the HTTP status code (503).
worker-api-no-document = the SignLens API answered HTTP { $status } without a document
# The API answered in a shape this version of the extension does not know. $problem: where and what, in English, for developers (“explanation.verdict "Review" is not a verdict this version knows”).
worker-api-unreadable = the SignLens API answered an explanation this version cannot read: { $problem }

## Why the settings cannot show the API's status, after “SignLens API not reachable:” in the popup (worker/api.ts)

# $url: the API's address; $status: the HTTP status code (503).
worker-status-http = the API at { $url } answered HTTP { $status }
worker-status-unreadable = the API at { $url } answered a status this version cannot read
# $error: the browser's words for the failure.
worker-status-no-answer = the API at { $url } did not answer ({ $error })

## Why an address typed in the settings is not used: the field's hint in the popup, and a row's note or failure (shared/endpoint.ts)

worker-endpoint-not-url = not a URL
worker-endpoint-not-http = not an http(s) URL
# $hosts: the names of this machine plain http may go to (localhost, 127.0.0.1), separated by worker-list-separator.
worker-endpoint-plain-http = plain http is for this machine only ({ $hosts }); use https
# $problem: one of the worker-endpoint- messages above.
worker-endpoint-refused-api = the API address in the settings is not usable: { $problem }
# $problem: one of the worker-endpoint- messages above.
worker-endpoint-refused-rpc = the RPC address in the settings is not usable: { $problem }
# The token list names tokens SignLens's snapshot lacks. $problem: one of the worker-endpoint- messages above.
worker-endpoint-refused-tokens = the token list address in the settings is not usable: { $problem }

## What the RPC answered when it did not answer what was asked: inside a lookup-table or simulation note (worker/solana.ts)

# $host: the RPC's host name; $status: the HTTP status code (403).
worker-rpc-http = { $host } answered HTTP { $status }
# $said: the start of what the RPC answered, as it answered it.
worker-rpc-http-said = { $host } answered HTTP { $status }: { $said }
# The same, for an RPC whose address has no host name to give.
worker-rpc-unnamed-http = the RPC answered HTTP { $status }
worker-rpc-unnamed-http-said = the RPC answered HTTP { $status }: { $said }
# JSON-RPC: the protocol the RPC speaks.
worker-rpc-not-json-rpc = the RPC at { $host } answered something that is not JSON-RPC
# $said: the RPC's own message.
worker-rpc-error = RPC error: { $said }
worker-rpc-error-unsaid = RPC error: no message
# $method: the call asked of it, by its name (getMultipleAccounts).
worker-rpc-other = the RPC at { $host } answered { $method } with something else

## Why a transaction's bytes could not be read for its lookup tables (worker/solana.ts)

worker-tx-empty = transaction is empty
worker-tx-truncated = transaction is truncated
worker-tx-trailing = transaction has trailing bytes
# compact-u16: Solana's encoding of a length, by its name.
worker-tx-compact-u16 = compact-u16 is too long
# $version: the message version's number, as the transaction gives it.
worker-tx-version = unsupported message version { $version }
# $table: the lookup table's address.
worker-table-missing = lookup table { $table } was not found
# $table: the lookup table's address; $index: the position the transaction asks for in it.
worker-table-no-index = lookup table { $table } has no index { $index }

## What a request's row keeps (worker/explain.ts, worker/history.ts, worker/requests.ts)

# A message to sign that is not text, shown as hexadecimal. $count: its length in bytes; $hex: the bytes.
worker-message-not-text = ({ $count } bytes, not text) { $hex }
# In place of an explanation's full text, in a history that had no room for it.
worker-history-slimmed = The full text was too long to keep in the history.
# A site's connect found no wallet to hand requests to, in the popup's history. $count: how many wallets the page had; $found: their names, each in double quotes, separated by worker-list-separator.
worker-connect-failed =
    SignLens could not connect: no wallet to pass requests to (found: { $count ->
        [0] none
       *[other] { $found }
    }). Choose a wallet in the extension's settings.
# The same, with a wallet chosen in the settings. $wanted: its name, in double quotes.
worker-connect-failed-named =
    SignLens could not connect: no wallet named { $wanted } to pass requests to (found: { $count ->
        [0] none
       *[other] { $found }
    }). Choose a wallet in the extension's settings.

## Why SignLens refused a request, after “Refused by SignLens:” in the popup's history (worker/gate.ts, worker/requests.ts, worker/sites.ts). The page that asked is told the English, which its developers read; the reader reads this.

# The page's tab closed, reloaded or went elsewhere while SignLens was explaining or asking: no one was left to pass the request to.
worker-refused-page-gone = the page closed or reloaded
# The page gave up waiting for an answer (after about ten minutes).
worker-refused-stopped-waiting = the page stopped waiting
# The window was left open without Continue or Reject until the page would wait no longer.
worker-refused-no-decision = no decision in time
# $error: the browser's words for why SignLens's window did not open.
worker-refused-window-not-open = the SignLens window could not open: { $error }
# $error: the browser's words for what went wrong with SignLens's window.
worker-refused-window-failed = the SignLens window failed: { $error }
# In watch mode, the page named a signer other than the address SignLens watches.
worker-refused-not-watched = the page named an address other than the one SignLens watches
# “yours”: among the reader's addresses in SignLens's settings.
worker-refused-several-not-yours = the page named more than one address that is not yours in SignLens; add yours in the settings, then ask again
# The quoted words are the name of the choice popup-ask-first-name, and must read as it does.
worker-refused-not-yours-ask-off = the page named an address that is not yours in SignLens, and with “Show the explanation and ask first” off SignLens does not ask; add it in the settings if it is yours
# The reader said the address was theirs, but it could not be added to the settings. $error: the browser's words for why.
worker-refused-address-not-kept = could not keep your address: { $error }
# In watch mode, the reader allowed the site, but the browser could not keep that. $error: its words for why.
worker-refused-site-not-kept = could not keep the site allowed: { $error }

## Why a request as a whole was not explained: its row in the window and the popup, which starts with a capital there (worker/explain.ts). The page that asked is told the English, which its developers read; the reader reads this.

# The page's tab closed, reloaded or went elsewhere while SignLens was explaining it.
worker-failed-page-gone = not explained: the page closed or reloaded
# The page gave up waiting for an answer (after about ten minutes) while SignLens was explaining it.
worker-failed-stopped-waiting = not explained: the page stopped waiting
# $count: how many transactions the page sent, always more than $max, the most SignLens explains in one request. Both are written as plain digits.
worker-failed-too-many = { $count } transactions in one request; SignLens explains at most { $max }
# base64: the encoding the page must send each transaction in, by its name.
worker-failed-not-list = transactions must be a list of base64 strings
# $max: the longest transaction SignLens takes, in bytes (4096), written as plain digits.
worker-failed-too-long = a transaction is longer than { $max } bytes
# A page asked to sign a message without sending one.
worker-failed-no-message = message is required
# $max: the longest message SignLens takes, in bytes (65536), written as plain digits.
worker-failed-message-too-long = the message is longer than { $max } bytes
# base64: the encoding the page must send the message in, by its name.
worker-failed-message-not-base64 = the message is not base64

## Shared by the messages above

# Between the items of a list: wallet names in worker-connect-failed, host names in worker-endpoint-plain-http.
worker-list-separator = { ", " }
