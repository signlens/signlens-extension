# Chrome Web Store

What SignLens's listing on the Chrome Web Store says, and how a version is
submitted. Each field below is pasted as it is; the screenshots and the
icon are files in this repository. The listing follows the Firefox one
([`firefox.md`](firefox.md)) where the two stores ask the same thing.

## Submitting a version

1. A Google account with two-step verification, registered as a developer
   at <https://chrome.google.com/webstore/devconsole> (a one-time fee),
   its contact email verified and the trader declaration answered.
2. **New item** the first time; afterwards **Package**, **Upload new
   package**, on the item's page.
3. The package: `signlens-extension-X.Y.Z.zip` from the GitHub release,
   not the Firefox one, the same bytes `npm run package` builds. The store
   refuses a package whose manifest's description is over 132 characters
   in any language, or its name over 75; `src/manifest.test.ts` holds
   every language to both.
4. The store listing, the privacy practices and the test instructions
   below, the first time; a
   version afterwards changes them only when what they say has changed.
5. **Submit for review**. Access to every https site, with content
   scripts on every https page, makes for a closer review than most.

The store publishes the package as a `.crx` it signs itself, with the
release's files inside, under an extension ID of its own: an install from
the store does not share its settings with one loaded unpacked from a
GitHub release.

## Store listing

| Field | Value |
|---|---|
| Name and summary | the manifest's (`locales/en/manifest.ftl`), which the dashboard does not edit |
| Category | Privacy & Security |
| Language | English, the default; Chinese (China) below |
| Store icon | `static/icons/icon-128.png`, the drawing at 96 px inside 16 px of transparent padding, as the store asks |
| Screenshots | below |
| Promo tiles, video | none (optional) |
| Homepage URL | <https://signlens.dev> |
| Support URL | <https://github.com/signlens/signlens-extension/issues> |
| Mature content | no |

### Description

The store shows it as plain text, so it is the Firefox description
without its Markdown. What a rating sends differs: in Chrome it always
carries the site and SignLens's version, which only Firefox asks about
first (`src/shared/consent.ts`).

```text
SignLens explains, in plain words, each Solana transaction a dapp asks you to sign, before your wallet signs it, and says so when it cannot.

Your wallet's preview shows what leaves your wallet. SignLens says where it goes and what it is for: a deposit into a lending market, a liquidity position, a stake, a leveraged order, or a drain.

How it works

- In a dapp, connect SignLens as your wallet. SignLens connects, in turn, to the wallet you already use: Phantom, Backpack, Solflare or another Solana wallet.
- Each request opens the SignLens window first: the verdict (OK, Warning or Blocked), what the transaction does, and what SignLens found.
- Continue, and the exact transaction SignLens explained goes to your wallet, which asks you as usual. SignLens holds no keys and signs nothing.

What it warns about

- An account or a whole wallet handed to someone else, which moves nothing when you sign
- Spending rights, an unlimited one spelled out
- Signatures that never expire (durable nonces)
- Addresses that only look like yours or a contact's
- Programs it has no reviewed description of, blocked rather than guessed
- Multisig approvals, with the proposal's steps read from your RPC
- A swap that pays someone else

What it sends

In this beta the explanation is computed by SignLens's server, api.signlens.dev. Each transaction you are asked to sign goes there, with the addresses it loads, a simulation's outcome, the accounts it names as your RPC returned them, your addresses and the addresses in your address book, so that the explanation can say "you" and tell your contacts from lookalikes; the names in your address book stay in your browser. The server keeps verdicts and finding codes, not the transaction. Your RPC, by default solana-rpc.publicnode.com, is asked for what the transaction refers to and simulates it. A rating sends nothing until you give one. https://signlens.dev/privacy says it all.

Solana mainnet, on a computer. Open source under the Apache 2.0 licence, and built reproducibly: https://github.com/signlens/signlens-extension

SignLens is not affiliated with the wallets and projects whose programs it explains.
```

### Screenshots

The Firefox listing's images (the store takes 1280×800, and no captions),
in this order:

1. `docs/store/firefox-screenshot-1.png`
2. `docs/store/firefox-screenshot-2.png`
3. `docs/store/firefox-screenshot-3.png`

[`firefox.md`](firefox.md) says how they are rendered.

## Privacy practices

### Single purpose

```text
SignLens explains each Solana transaction a dapp asks you to sign, in a window of its own, before passing it unchanged to your own wallet extension, which signs it as usual.
```

### Permission justification

`storage`:

```text
Keeps the settings (your addresses, your address book, the wallet to pass requests to, the API, RPC and token list to ask) and the recent requests the popup lists, in the browser.
```

Host permission:

```text
SignLens is a Solana wallet in the Wallet Standard, which lives in each page's own scripts, so its content scripts run on every https page a dapp may be on: page/injected.js registers the "SignLens" wallet in the page and relays its calls, and page/content.js passes them to the background over a MessageChannel the page cannot reach. Neither reads nor changes the page's content; the content script reads only the page's origin, so that the window can name the site. The background sends requests to the SignLens API, the Solana RPC and the token list named in the settings, which the user may point at any https endpoint, or at one on their own machine (localhost, 127.0.0.1).
```

### Remote code

**No, I am not using remote code.** Every script is in the package (the
extension pages' CSP is `script-src 'self'`); the API answers JSON, which
`src/worker/explanation.ts` checks field by field and the window shows as
text.

### Data usage

| Category | Collected | What |
|---|---|---|
| Personally identifiable information | no | the address book's names stay in the browser: the API is sent a random stand-in for each (`src/worker/contacts.ts`) |
| Health information | no | |
| Financial and payment information | yes | each transaction to sign, your addresses and the address book's, and the accounts an explanation names |
| Authentication information | no | no keys, seed phrases or passwords, ever |
| Personal communications | no | |
| Location | no | the API sees each request's IP address, through Cloudflare, and uses it only to count requests against its limit, in memory as a keyed hash, logged nowhere |
| Web history | yes | the host of the site a rating was given on, which a rating carries |
| User activity | no | |
| Website content | no | the content scripts read only the page's origin |

All three certifications: SignLens sells no data, uses none for anything
but explaining transactions, and none to judge creditworthiness.

Privacy policy: <https://signlens.dev/privacy>, which also covers the site.

## Distribution

Public, free, in every region.

## Test instructions

The dashboard's **Test instructions**: no username or password, and this
as the instructions, which the store takes only up to 500 characters
(440 here). The Firefox reviewer notes' TRYING IT has the same
steps in full.

```text
No wallet needed. In the popup's Settings, under "After explaining a request" choose "Refuse it (watch-only, no keys involved)", and in "Address to connect as" paste 2P5tkJVpceLPdnejvc5DBGd4RxkmtouYfNkb9KKPsPxW, a public wallet with Kamino and Jupiter Lend positions. On app.kamino.finance or jup.ag, connect "SignLens", choose Allow, then withdraw or swap: the SignLens window explains the transaction and refuses it, so nothing is signed.
```

The address is the wallet of the Kamino deposit in `test/fixtures/`. On
2026-11-02 it held 0.098 SOL, deposits in five Kamino Lend markets and
about 16,729 jlUSDC (Jupiter Lend USDC). A stranger may close their
positions at any time: before a submission, check it still has them, or
give an address that does. A swap needs only some SOL.

## The Simplified Chinese listing (zh_CN)

For Chinese (China), the name and summary are the manifest's
(`locales/zh-Hans/manifest.ftl`). The description is the Firefox listing's
Chinese, reviewed by a native speaker on 2026-10-31, without its Markdown
and with two deletions as in the English: the rating's "only once you
allow them" (只有在您允许后，才会发送网站和 SignLens 的版本), and the privacy
policy "below" (下方的隐私政策以及), since the store links it instead.

```text
SignLens 会在您的钱包签名之前，用平实的语言解释 DApp 请您签名的每一笔 Solana 交易；无法解释时，它也会如实说明。

钱包的预览只显示有什么离开您的钱包。SignLens 则说明它去向何处、用途是什么：存入借贷市场、建立流动性仓位、质押、杠杆订单，还是在盗取您的资产。

工作方式

- 在 DApp 中，选择 SignLens 作为您的钱包进行连接。SignLens 再连接到您已在使用的钱包：Phantom、Backpack、Solflare 或其他 Solana 钱包。
- 每个请求都会先打开 SignLens 的窗口：结论（正常、警告或已拦截）、此交易会做什么，以及 SignLens 的检查结果。
- 选择继续后，SignLens 所解释的这笔交易会原样转交给您的钱包，钱包会照常请求您的批准。SignLens 不持有私钥，也不签署任何内容。

它会警示什么

- 将某个账户乃至整个钱包的控制权移交给他人（签名时并不会立即转移资产）
- 代币支出授权，无限额度的授权会明确写出
- 永不过期的签名（持久随机数）
- 外观与您的地址或联系人地址相似的仿冒地址
- 尚无经审核描述文件的程序：直接拦截，而不是猜测
- 多签批准，并从您的 RPC 读取提案的各个步骤
- 将兑换所得付给他人的交易

它会发送什么

在此测试版中，解释由 SignLens 的服务器 api.signlens.dev 计算。每一笔请您签名的交易都会发送到那里，同时发送它加载的地址、模拟的结果、您的 RPC 返回的它所指明的账户、您的地址以及您地址簿中的地址，以便解释能用“您”来称呼您，并分辨您的联系人与相似地址；地址簿中的名称会留在您的浏览器中。服务器保存结论和检查结果代码，而不保存交易本身。您的 RPC（默认为 solana-rpc.publicnode.com）会被询问交易所引用的内容，并对交易进行模拟。在您给出评价之前，评价功能不会发送任何内容。https://signlens.dev/privacy 对此有完整说明。

支持电脑上的 Solana 主网。基于 Apache 2.0 许可证开源，并可重现构建：https://github.com/signlens/signlens-extension

SignLens 与其所解释程序背后的钱包和项目没有关联。
```

Its screenshots are the Chinese ones, under **Localized screenshots**:

1. `docs/store/firefox-screenshot-1.zh-Hans.png`
2. `docs/store/firefox-screenshot-2.zh-Hans.png`
3. `docs/store/firefox-screenshot-3.zh-Hans.png`
