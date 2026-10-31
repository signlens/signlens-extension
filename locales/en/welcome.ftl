### The setup page a new install opens (static/welcome.html, ui/welcome.ts).

welcome-page-title = Set up SignLens
welcome-heading = Set up SignLens
welcome-intro = SignLens shows what a Solana transaction does before your wallet asks you to sign it. It holds no keys: your wallet still signs, and asks you as it always has.

## Where the browser has not granted it, the access SignLens needs

welcome-access-title = First, let SignLens reach the API and your RPC
welcome-access-text = This browser has not let SignLens reach them yet, and without them nothing can be explained.

## 1. The reader's addresses

welcome-addresses-title = 1. Your wallet addresses
# “you”: the explanations' word for the reader.
welcome-addresses-text = SignLens calls only these addresses “you” in its explanations, so a site cannot pass off its own address as yours. Copy them from your wallet (Phantom, Solflare, Backpack, …).
welcome-addresses-note = An address you leave out is asked about the first time a site signs with it. You can change them any time in SignLens's settings.

## 2. Using it

welcome-use-title = 2. Use it in a dapp
# SignLens is the wallet's name in the dapp's list, so it is marked as the name it shows there.
welcome-use-choose = In the dapp's list of wallets, choose <strong>SignLens</strong> rather than your wallet. SignLens connects through your wallet, which asks you as usual.
welcome-use-window = Each request then opens SignLens's window first. Read what the transaction does, then continue to your wallet, or reject.
welcome-use-reconnect = Dapps reconnect the wallet you used last. Where one connects your wallet directly, SignLens is skipped: disconnect it there, and choose SignLens.
welcome-use-wallets = Using more than one wallet? The first time you connect, SignLens asks which one it passes your requests to, and keeps your choice; its popup's settings change it.

## 3. Pinning it

welcome-pin-title = 3. Pin SignLens to the toolbar
welcome-pinned = Pinned: SignLens is on the toolbar.
welcome-pin-steps = Open the extensions menu (the puzzle-piece icon in the toolbar) and pin SignLens: its badge then shows the verdict of each request, and its popup lists them.

## What leaves the browser

welcome-privacy-title = What leaves your browser
welcome-privacy-text = In this beta, each transaction you are asked to sign is sent to SignLens's API to be explained, with your addresses and those in your address book, so the explanation can say “you” and tell your contacts from lookalikes; their names stay in your browser. The server keeps verdicts and finding codes, not the transaction, unless you choose to send it with a rating. Lookup tables, accounts and a simulation are read from the RPC in the settings.

welcome-more = All of this, and more, is in the settings in SignLens's popup.
welcome-done = Done
