# Simplified Chinese (zh-Hans): the interface's style note and terms

How the extension's own interface is written in Simplified Chinese
(ADR-0015, phase 5). It follows the engine's style note and term list
(the engine's `packs/locales/zh-Hans.md`, reviewed by a native speaker
on 2026-10-30 and 31), so that the window's words and the explanation's
read as one; what is below is that note's rules as the interface needs
them, and the interface's own terms. The draft follows it and the review
checks against it. `scripts/messages.ts` reads the words under "Kept in
English": a translation may write those in Latin letters, and no other.

## Register

- Address the reader as 您, as a bank or an exchange does: 您的钱包, 您的地址.
- A button or a heading is short and drops the subject: 继续, 拒绝, 设置.
- Plain words over formal ones. A warning says what happens.

## Punctuation and spacing

- Full-width punctuation in Chinese text: ，。：；（）！？、“”. Half-width only
  inside Latin: `jup.ag`, `http://localhost`.
- A half-width space between a Chinese character and a Latin letter or a
  digit: `发送 3 笔交易`, `打开 SignLens 的窗口`.
- Around a placeholder the interface sets the space where its value meets
  the words, as the engine does: a space where Chinese meets a site, a
  wallet's name, a number or an address; none where it meets Chinese words
  or full-width punctuation, whatever the translation wrote. Write it the
  same way, so that the source reads as the result does.
- Never a space beside full-width punctuation, and no full-width brackets
  inside full-width brackets.
- A label and its value are joined by "：" with no space.
- `…` for an ellipsis, as the English writes it.

## Numbers

Never write a number a placeholder holds. A count takes its measure word:
3 笔交易, 2 个地址, 5 个钱包. Chinese has one plural form: a select on a
count keeps `*[other]`, and a case the English singles out (`[0]`, `[1]`)
only where the words differ.

## What must never drift

The signing window's words carry the reader's decision, and the review
reads them first.

| English | Chinese |
| --- | --- |
| Continue (to your wallet) | 继续（前往您的钱包） |
| Continue anyway | 仍要继续 |
| Reject | 拒绝 |
| refused, rejected (a request) | 已拒绝 |
| blocked (a verdict) | 已拦截 |
| not explained | 未能解释 |
| holds no keys: nothing was signed | 不持有私钥：未签署任何内容 |
| unverified; claimed | 未验证; 声称 |
| cannot be undone | 无法撤销 |

A negation stays a negation, and who receives stays who receives.

## Terms

The engine's terms, which the explanation uses (from Solana's own Chinese
documentation, and reviewed):

| English | Chinese |
| --- | --- |
| transaction | 交易 |
| instruction | 指令 |
| account | 账户 |
| address | 地址 |
| program | 程序 |
| sign; signature | 签名 |
| signer; fee payer | 签名者; 手续费付款方 |
| fee | 手续费 |
| wallet | 钱包 |
| token | 代币 |
| address lookup table; lookup table | 地址查找表; 查找表 |
| finding | 检查结果 |
| OK; warning; blocked by default (the verdict) | 正常; 警告; 默认拦截 |
| verified; unverified; claimed | 已验证; 未验证; 声称 |
| simulation; balance change | 模拟; 余额变动 |
| slot; epoch | `slot`; `epoch`, kept in English |

The interface's own terms, proposed for the review's first pass:

| English | Chinese |
| --- | --- |
| request (a site's, to sign or connect) | 请求 |
| the window (SignLens's) | 窗口 |
| the popup | 弹出窗口 |
| settings | 设置 |
| history, the requests | 请求记录 |
| explanation; explained | 解释; 已解释 |
| verdict | 结论 |
| watch mode; the watched address | 观察模式; 观察的地址 |
| pass-through mode | 直通模式 |
| dapp; site; page | DApp; 网站; 页面 |
| message (to sign) | 消息 |
| address book; contact; lookalike | 地址簿; 联系人; 相似地址 |
| rating; feedback | 评价; 反馈 |
| Show in English; Show in your language | 显示英文原文; 以您的语言显示 |
| Try again | 重试 |
| pin to the toolbar | 固定到工具栏 |
| endpoint (the API's or the RPC's address) | 地址 |

## Kept in English

Names and symbols a translation may write in Latin letters, as they are:

`SignLens` `Solana` `SOL` `USDC` `API` `RPC` `HTTP` `HTTPS` `http` `https`
`URL` `localhost` `DApp` `Phantom` `Solflare` `Backpack` `MetaMask` `Chrome`
`Firefox` `JSON` `UTF-8` `base64` `ID` `slot` `epoch` `Unicode` `Wallet`
`Standard`
