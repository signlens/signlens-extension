## The window's title and the lines under it

window-page-title = { $verdict ->
    [ok] 正常：{ $site } 请求{ $request } · SignLens
    [warning] 警告：{ $site } 请求{ $request } · SignLens
    [blocked] 已拦截：{ $site } 请求{ $request } · SignLens
    [error] 错误：{ $site } 请求{ $request } · SignLens
   *[message] { $site } 请求{ $request } · SignLens
}
window-heading-transactions = { $count ->
   *[other] 签名 { $count } 笔交易
}
window-heading-message = 签名消息
window-where = { $origin } 请求您签名
window-unknown-page = 未知页面

## The band under them: the verdict, and the one-line summary

window-band-of-several = { $summary }（第 { $index } 笔交易，共 { $count } 笔；每笔均在下方列出）
window-transaction-of = 第 { $index } 笔交易（共 { $count } 笔）

## Explaining the request again, in another language or after a failure

window-show-english = 显示英文原文
window-show-yours = 以您的语言显示
window-asking-english = 正在请求英文解释…
window-asking-yours = 正在以您的语言请求解释…
window-try-again = 重试
window-asking-again = 正在按当前设置重新请求解释…
window-not-explained-again = 此请求已不再待处理，因此没有重新解释。如果您仍打算签名，请回到网站重新发起请求。

## The decision: the note above the buttons, and the buttons

window-reject = 拒绝
window-continue = 继续
window-close = 关闭
window-continue-to = 继续前往 { $wallet }
window-continue-to-yours = 继续前往您的钱包
window-continue-anyway-to = 仍要继续前往 { $wallet }
window-continue-anyway-to-yours = 仍要继续前往您的钱包
window-note-continue = { $to ->
    [settings] “继续”会将请求原样转交给 { $wallet }，该钱包会另行请求您的批准。
    [page] “继续”会将请求原样转交给页面上的第一个钱包（页面称其为“{ $wallet }”），该钱包会另行请求您的批准。
   *[none] “继续”会将请求原样转交给您的钱包，该钱包会另行请求您的批准。
}
window-note-refused = { $to ->
    [settings] SignLens 默认会拒绝此请求。若仍要继续，它将被原样转交给 { $wallet }，该钱包会另行请求您的批准。
    [page] SignLens 默认会拒绝此请求。若仍要继续，它将被原样转交给页面上的第一个钱包（页面称其为“{ $wallet }”），该钱包会另行请求您的批准。
   *[none] SignLens 默认会拒绝此请求。若仍要继续，它将被原样转交给您的钱包，该钱包会另行请求您的批准。
}
window-note-refused-ask-off = { $to ->
    [settings] “显示解释并先询问”已关闭，但对于 SignLens 会拒绝的请求，它仍会在转交前先询问您。若继续，此请求将被原样转交给 { $wallet }，该钱包会另行请求您的批准。
    [page] “显示解释并先询问”已关闭，但对于 SignLens 会拒绝的请求，它仍会在转交前先询问您。若继续，此请求将被原样转交给页面上的第一个钱包（页面称其为“{ $wallet }”），该钱包会另行请求您的批准。
   *[none] “显示解释并先询问”已关闭，但对于 SignLens 会拒绝的请求，它仍会在转交前先询问您。若继续，此请求将被原样转交给您的钱包，该钱包会另行请求您的批准。
}
window-note-no-keys = 此钱包不持有私钥：无论如何，此请求都会被拒绝。
window-not-passed-on = 未转交任何内容：此请求已不再待处理。如果您仍打算签名，请回到网站重新发起请求。
window-no-answer = SignLens 没有响应，因此无法得知此请求是否已生效：弹出窗口中的请求记录会显示其结果。

## The question the Continue anyway button asks first, on a request SignLens would refuse

window-anyway-title = 仍要转交此请求？
window-refusal-blocked = SignLens 已拦截此交易。{ $why }
window-refusal-unexplained = SignLens 未能解释此交易，因此无从得知它会做什么。
window-refusal-of-several = { $why }（第 { $index } 笔交易，共 { $count } 笔）
window-anyway-back = 返回
window-anyway-go = 仍要继续

## A window whose request is gone (every window)

window-gone-page-title = 已不再待处理 · SignLens
window-gone-heading = 已不再待处理
window-gone-text = 此请求已不再待处理：其页面已关闭、已重新加载或已停止等待。它没有产生任何结果。

## The feedback strip under the explanation

window-feedback-ask = 这份解释清楚吗？
window-rating-clear = 清楚
window-rating-unclear = 不清楚
window-rating-wrong = 有误
window-feedback-what = 评价会向 SignLens 发送网站、SignLens 的版本、此窗口显示的内容（结论、检查结果和所调用的程序）以及您的留言。只有当您勾选下方的复选框时，才会发送交易本身。
window-feedback-what-firefox = 评价会向 SignLens 发送此窗口显示的内容（结论、检查结果和所调用的程序）和您的留言；在 Firefox 询问时，如果您允许，还会发送网站和 SignLens 的版本。只有当您勾选下方的复选框时，才会发送交易本身。
window-feedback-cover = { $count ->
   *[other] 将交易本身发送给 SignLens，以便调查
}
window-feedback-comment =
    .placeholder = 哪里不清楚或有误？（选填）
    .aria-label = 哪里不清楚或有误？（选填）
window-feedback-add-word = 如有需要，可补充说明；它会在您于下方做出决定时一并发送。
window-feedback-sent = 谢谢。已发送给 SignLens。
window-feedback-failed = 无法发送反馈。

## A row of a request: the headings and toggles of a transaction explained

row-actions = { $count ->
   *[other] { $count } 项操作
}
row-findings-title = SignLens 的检查结果
row-effects-title = 此交易会做什么
row-severity-info = 信息
row-severity-warning = 警告
row-severity-high = 高危
row-severity-critical = 严重
row-instructions-toggle = { $count ->
    [0] 详情
    [1] 指令和详情
   *[other] 指令（{ $count } 条）和详情
}
row-details-toggle = 详情：{ $sections }
row-step = 第 { $index } 步：{ $title }
row-full-text = 引擎输出的完整文本
row-list-separator = 、

## Trust: the marker on a value, and the help it opens

row-claimed = （声称，未验证）
row-verified = 已验证
row-help-verified = 此名称来自 SignLens 或您本人：SignLens 经审核的程序描述文件、已验证的代币列表、您在其设置中填写的地址，或您的地址簿。它不可能来自网站。
row-help-claimed = 此信息来自网站，或来自扩展程序所查询的 RPC，而不是交易本身。SignLens 无法验证它，因此请勿依赖它。
row-help-claims = 此部分的所有内容均来自扩展程序所查询的 RPC，而不是交易本身。SignLens 无法验证这些内容，因此请仅将其视为参考，而非事实。

## Values: where the engine sends no words for them, the extension's

row-raw-units = { $count ->
   *[other] { $units } 原始单位
}
row-duration-days = { $days ->
   *[other] { $days } 天
}{ $hours ->
    [0] {""}
   *[other] { " " }{ $hours } 小时
}
row-duration-hours = { $hours ->
   *[other] { $hours } 小时
}{ $minutes ->
    [0] {""}
   *[other] { " " }{ $minutes } 分钟
}
row-duration-minutes = { $minutes ->
   *[other] { $minutes } 分钟
}{ $seconds ->
    [0] {""}
   *[other] { " " }{ $seconds } 秒
}
row-duration-seconds = { $seconds ->
   *[other] { $seconds } 秒
}
row-yes = 是
row-no = 否
row-unrecognized-value = 此版本无法显示的值（{ $type }）；下方的完整文本中包含它
row-bytes-show-all = { $count ->
   *[other] 显示全部 { $count } 字节
}
row-bytes-show-less = 收起
row-amount-symbol = { $bound ->
    [at_least] ≥ { $quantity } { $symbol }
    [at_most] ≤ { $quantity } { $symbol }
    [unlimited] <strong>无限</strong> { $symbol }
    [unknown] 未知数量的 { $symbol }
   *[exact] { $quantity } { $symbol }
}
row-amount-token = { $bound ->
    [at_least] ≥ { $quantity } 的{ $token }
    [at_most] ≤ { $quantity } 的{ $token }
    [unlimited] <strong>无限</strong>数量的{ $token }
    [unknown] 未知数量的{ $token }
   *[exact] { $quantity } 的{ $token }
}
row-unverified-token = 未验证代币 { $mint }
row-amount-note = （{ $note }）
row-labelled-address = { $label }（{ $address }）

## A row of a request: a transaction not explained, a message, and requests that are not a transaction

row-not-explained = SignLens 未能解释此交易：无从得知它会做什么。
row-not-explained-ask-again = SignLens 未能解释此交易：无从得知它会做什么。如需重试，请先拒绝，再回到网站重新发起请求。
row-message-unchecked = SignLens 不检查消息：此消息按原样显示。请仅在您确实认同其内容时签名。
row-consent-where = 设置中列出了获准查看观察的地址的网站；在那里点击“撤销”即可收回某个网站的权限。
row-address-claimed = 页面声称以下地址是您的地址，但并非您在 SignLens 中的地址：
row-address-refused = 在解释任何内容或将其发往任何地方之前，此请求就已被拒绝。

## A row of a request: what was read besides the transaction, and saving it

row-chain = 链：页面指明为 { $chain }；但仍使用设置中的 RPC 读取并模拟
row-tables = 查找表：{ $tables }
row-simulation = 模拟：{ $simulation }
row-accounts = 从 RPC 读取的账户（未验证）：{ $accounts }
row-hints = 根据 RPC 和代币列表命名的未收录代币（未验证）：{ $tokens }
row-save = 保存交易
row-save-numbered = 保存第 { $part } 笔交易
row-save-title = 交易及其查找表，采用 SignLens 引擎读取的格式
