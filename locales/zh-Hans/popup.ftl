## The header: the API's status, the access SignLens needs, and your address

popup-checking = 正在检查 SignLens API…
popup-engine-unsafe = 未使用 SignLens API：设置中的 API 地址不是 SignLens 可以调用的地址。
popup-engine-down = 无法连接 SignLens API：{ $error }
popup-engine-ready = SignLens API 已就绪：引擎 { $engine }，{ $programs } 个程序，{ $tokens } 种已验证代币。{ $languages }
popup-languages = { $count ->
    [0] 以英文解释。
   *[other] 以英文解释；当您的浏览器要求时，也以下列语言解释：{ $languages }。
}
popup-language = { $review ->
    [reviewed] { $language }，审核于 { $on }
   *[other] { $language }，未经审核
}
popup-language-named = { $name }（{ $tag }）
popup-languages-separator = { "；" }
popup-permissions = 此浏览器尚未允许本扩展程序访问 API、RPC 和代币列表。
popup-setup-ask = 请添加您的钱包显示的地址，这样 SignLens 就不必询问哪个地址是您的。
popup-setup-added = 已添加。从现在起，SignLens 会称它为“您”；您的地址都在设置中。

## The two views, as tabs

popup-views =
    .aria-label = 视图
popup-tab-requests = 请求
popup-tab-settings = 设置
popup-unseen = 新增 { $count } 条

## The requests

popup-newest-first = 最新的在前
popup-clear = 清除
    .aria-label = 清除请求记录
popup-clear-failed = 未能清除请求记录，请重试。
popup-empty = 暂无。请在 DApp 中连接“SignLens”，然后发起一笔交易。
popup-verdict-connect = 连接
popup-decision-refused = 已拒绝
popup-decision-allowed = 已允许
popup-decision-denied = 已拒绝
popup-decision-watch-only = 仅观察
popup-decision-passed-on = 已转交
popup-decision-passed-on-unasked = 已转交，未询问
popup-decision-rejected = 您已拒绝
popup-refused = SignLens 已拒绝：{ $reason }

## The settings: what happens to a request

popup-not-saved = 未保存：{ $error }
popup-mode-legend = 解释请求之后
popup-mode-pass = <strong>转交给您的钱包</strong>签名，保持原样
popup-mode-watch = <strong>拒绝该请求</strong>（仅观察，不涉及私钥）
popup-upstream-label = 转交请求的目标钱包
popup-upstream-first = 找到的第一个钱包
popup-upstream-elsewhere = { $wallet }（不在此页面上）
popup-upstream-found = 在 { $site } 上找到：{ $wallets }。
popup-upstream-found-here = 在此页面上找到：{ $wallets }。
popup-upstream-none = 未找到其他钱包。请打开一个 DApp，然后回到这里。
popup-no-wallet-elsewhere = SignLens 不在此页面上运行。请打开一个 DApp（https 页面），然后重新打开此弹出窗口。
popup-no-wallet-reload = SignLens 尚未在此标签页中运行。请重新加载此标签页（安装或更新 SignLens 后需要重新加载一次），然后重新打开此弹出窗口。
popup-no-wallet-page = 此标签页中未找到其他钱包。请打开一个 DApp，然后回到这里。
popup-list-separator = { "、" }

## The settings: your addresses, and the address watch-only mode connects as

popup-yours-title = 您的地址
popup-yours-note = 只有这些地址会被 SignLens 称为“您”。当网站把另一个地址称为您的地址时，SignLens 会先询问您，再解释任何内容；如果关闭了“显示解释并先询问”，则会拒绝该请求。请从您的钱包中复制这些地址。
popup-address-label = 连接时使用的地址
popup-address-field =
    .placeholder = 任意 Solana 地址
popup-address-bad = 不是 Solana 地址（应为 32 字节的 base58 编码）。
popup-sites-title = 可查看该地址的网站
popup-sites-empty = 暂无：网站首次连接时会先询问。
popup-revoke = 撤销
popup-revoke-label = 撤销 { $site } 查看 { $address } 的权限
popup-revoke-failed = 未能撤销 { $site } 的权限，请重试。
popup-other-address = 另一个地址

## The settings: the choices, each named by its bold words (…-name) and described by the rest of its line (…-more)

popup-ask-first = { $name }，{ $more }
popup-ask-first-name = 显示解释并先询问
popup-ask-first-more = 再拒绝或转交请求；关闭此项时，在直通模式下，SignLens 本会拒绝的请求（已拦截或出错）仍会先等待您的决定，再转交给您的钱包
popup-simulate = { $name }，{ $more }
popup-simulate-name = 通过 RPC 模拟交易
popup-simulate-more = 并将余额变动作为未验证的声称，与解释对照；会将整笔交易发送给 RPC
popup-accounts = { $name }，{ $more }
popup-accounts-name = 读取解释所需的账户
popup-accounts-more = 例如多签提案中存储的交易或治理提案的选项，从 RPC 读取，作为未验证的声称；会将这些账户的地址发送给 RPC
popup-tokens = { $name }，{ $more }
popup-tokens-name = 显示未收录代币的名称
popup-tokens-more = 名称取自 RPC 上的代币铸造账户和下方的代币列表，作为未验证的声称

## The settings: the address book

popup-contacts-label = 地址簿，每行一条<code>名称 = 地址</code>
popup-contacts-field =
    .placeholder = Bob = 7s3s…
popup-contacts-bad = { $count ->
   *[other] 第 { $lines } 行未能读取：格式应为“名称 = 地址”。
}
popup-contacts-over = { $count ->
   *[other] 只使用前 { $max } 个联系人；第 { $lines } 行未使用。
}
popup-contacts-both = { $bad }{ $over }

## The settings: the API, the RPC and the token list

popup-api-label = SignLens API
popup-api-note = 测试版：每笔请您签名的交易都会发送到此 API 进行解释，同时发送您的地址和您地址簿中的地址，以便解释能用“您”来称呼您，并区分您的联系人与相似地址；联系人的名称留在您的浏览器中。服务器保存结论和检查结果代码，不保存交易的原始字节；只有当您在解释下方勾选“将交易本身发送给 SignLens，以便调查”时，才会保存该交易。
popup-rpc-label = 用于查找表、账户、代币铸造账户和模拟的 RPC
popup-token-list-label = 代币列表（符号）
popup-token-list-note = 未收录代币的代币铸造地址会发送给 RPC 和此列表。
popup-endpoint-kept = 未使用：{ $problem }。SignLens 仍在使用 { $kept }。
popup-endpoint-none = { $endpoint ->
    [apiUrl] 未使用：{ $problem }。修正之前，SignLens 不会向任何 API 发出请求。
    [rpcUrl] 未使用：{ $problem }。修正之前，SignLens 不会向任何 RPC 发出请求。
   *[tokenApiUrl] 未使用：{ $problem }。修正之前，SignLens 不会向任何代币列表发出请求。
}
popup-setup-again = 打开初始设置页面
