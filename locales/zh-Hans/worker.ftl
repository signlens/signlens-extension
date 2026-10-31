## The toolbar badge: the worst verdict among the requests the popup has not shown yet (worker/history.ts). The badge has room for about 4 characters: keep each to at most 4.

worker-badge-ok = 正常
worker-badge-warning = 警告
worker-badge-blocked = 拦截
worker-badge-error = ?
worker-badge-message = 消息

## A transaction's lookup tables, shown after “Lookup tables:” under its row (worker/tables.ts)

worker-tables-not-parsed = 交易未能解析（{ $error }）
worker-tables-read = 已通过 RPC 读取 { $count } 个查找表，未验证
worker-tables-not-resolved = { $count } 个查找表未能解析（{ $error }）

## The simulation of a transaction over the RPC, shown after “Simulation:” under its row (worker/explain.ts)

worker-simulation-not-parsed = 未运行（交易未能解析）
worker-simulation-unavailable = 未运行（{ $error }）
worker-simulation-failed = 交易执行失败
worker-simulation-changes = { $count } 项余额变动，未验证

## Why a transaction of a request was not explained: its row in the window and the popup, after “Not explained:” (worker/explain.ts, worker/api.ts)

worker-limited = SignLens API 暂时不再接受解释请求，从第 { $at } 笔交易（共 { $count } 笔）起均未解释；请一分钟后重试
worker-api-error-unsaid = SignLens API 返回了错误，但没有错误信息
worker-api-no-answer = 位于 { $url } 的 SignLens API 没有响应（{ $error }）
worker-api-no-v2 = 位于 { $url } 的 SignLens API 不提供此版本所需的 /v2/explain；请更新该 API，或在设置中使用默认 API
worker-api-not-explanation = SignLens API 返回了 HTTP { $status }，但内容不是解释
worker-api-no-document = SignLens API 返回了 HTTP { $status }，但没有返回文档
worker-api-unreadable = SignLens API 返回了此版本无法读取的解释：{ $problem }

## Why the settings cannot show the API's status, after “SignLens API not reachable:” in the popup (worker/api.ts)

worker-status-http = 位于 { $url } 的 API 返回了 HTTP { $status }
worker-status-unreadable = 位于 { $url } 的 API 返回了此版本无法读取的状态
worker-status-no-answer = 位于 { $url } 的 API 没有响应（{ $error }）

## Why an address typed in the settings is not used: the field's hint in the popup, and a row's note or failure (shared/endpoint.ts)

worker-endpoint-not-url = 不是有效的 URL
worker-endpoint-not-http = 不是 http 或 https 的 URL
worker-endpoint-plain-http = 未加密的 http 只能用于本机地址 { $hosts }；请使用 https
worker-endpoint-refused-api = 设置中的 API 地址不可用：{ $problem }
worker-endpoint-refused-rpc = 设置中的 RPC 地址不可用：{ $problem }
worker-endpoint-refused-tokens = 设置中的代币列表地址不可用：{ $problem }

## What the RPC answered when it did not answer what was asked: inside a lookup-table or simulation note (worker/solana.ts)

worker-rpc-http = { $host } 返回了 HTTP { $status }
worker-rpc-http-said = { $host } 返回了 HTTP { $status }：{ $said }
worker-rpc-unnamed-http = RPC 返回了 HTTP { $status }
worker-rpc-unnamed-http-said = RPC 返回了 HTTP { $status }：{ $said }
worker-rpc-not-json-rpc = 位于 { $host } 的 RPC 返回的内容不是 JSON-RPC
worker-rpc-error = RPC 错误：{ $said }
worker-rpc-error-unsaid = RPC 错误：没有错误信息
worker-rpc-other = 位于 { $host } 的 RPC 对 { $method } 返回的不是所请求的结果

## Why a transaction's bytes could not be read for its lookup tables (worker/solana.ts)

worker-tx-empty = 交易为空
worker-tx-truncated = 交易被截断
worker-tx-trailing = 交易末尾有多余的字节
worker-tx-compact-u16 = compact-u16 编码过长
worker-tx-version = 不支持的交易消息版本 { $version }
worker-table-missing = 未找到查找表 { $table }
worker-table-no-index = 查找表 { $table } 中没有索引 { $index }

## What a request's row keeps (worker/explain.ts, worker/history.ts, worker/requests.ts)

worker-message-not-text = （{ $count } 字节，非文本）{ $hex }
worker-history-slimmed = 完整文本过长，无法保留在请求记录中。
worker-connect-failed =
    SignLens 无法连接：没有可以转交请求的钱包（找到的钱包：{ $count ->
        [0] 无
       *[other] { $found }
    }）。请在扩展程序的设置中选择钱包。
worker-connect-failed-named =
    SignLens 无法连接：没有名为 { $wanted } 的钱包可以转交请求（找到的钱包：{ $count ->
        [0] 无
       *[other] { $found }
    }）。请在扩展程序的设置中选择钱包。

## Why SignLens refused a request, after “Refused by SignLens:” in the popup's history (worker/gate.ts, worker/requests.ts, worker/sites.ts). The page that asked is told the English, which its developers read; the reader reads this.

worker-refused-page-gone = 页面已关闭或重新加载
worker-refused-stopped-waiting = 页面已停止等待
worker-refused-no-decision = 未在时限内作出决定
worker-refused-window-not-open = SignLens 窗口无法打开：{ $error }
worker-refused-window-failed = SignLens 窗口出错：{ $error }
worker-refused-not-watched = 页面指定的地址不是 SignLens 观察的地址
worker-refused-several-not-yours = 页面指定的地址中，有不止一个不是您在 SignLens 中的地址；请在设置中添加您的地址，然后重新发起请求
worker-refused-not-yours-ask-off = 页面指定的地址不是您在 SignLens 中的地址，而“显示解释并先询问”关闭时，SignLens 不会询问；如果这是您的地址，请在设置中添加
worker-refused-address-not-kept = 无法保存您的地址：{ $error }
worker-refused-site-not-kept = 无法保存对此网站的许可：{ $error }

## Why a request as a whole was not explained: its row in the window and the popup, which starts with a capital there (worker/explain.ts). The page that asked is told the English, which its developers read; the reader reads this.

worker-failed-page-gone = 未能解释：页面已关闭或重新加载
worker-failed-stopped-waiting = 未能解释：页面已停止等待
worker-failed-too-many = 一个请求中有 { $count } 笔交易；SignLens 每个请求最多解释 { $max } 笔
worker-failed-not-list = 交易必须是由 base64 字符串组成的列表
worker-failed-too-long = 有一笔交易超过 { $max } 字节
worker-failed-no-message = 必须提供消息
worker-failed-message-too-long = 消息超过 { $max } 字节
worker-failed-message-not-base64 = 消息不是 base64 编码

## Shared by the messages above

worker-list-separator = 、
