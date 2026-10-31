welcome-page-title = SignLens 初始设置
welcome-heading = SignLens 初始设置
welcome-intro = SignLens 会在您的钱包请您签名之前，向您显示一笔 Solana 交易会做什么。它不持有私钥：仍由您的钱包签名，钱包也会像往常一样询问您。

## Where the browser has not granted it, the access SignLens needs

welcome-access-title = 首先，允许 SignLens 访问 API 和您的 RPC
welcome-access-text = 此浏览器尚未允许 SignLens 访问它们，而没有它们，就无法解释任何内容。

## 1. The reader's addresses

welcome-addresses-title = 1. 您的钱包地址
welcome-addresses-text = 在解释中，SignLens 只把这些地址称为“您”，因此网站无法把它自己的地址冒充为您的地址。请从您的钱包（Phantom、Solflare、Backpack…）中复制这些地址。
welcome-addresses-note = 对于您未在此填写的地址，SignLens 会在网站第一次用它请求签名时询问您。您可以随时在 SignLens 的设置中更改这些地址。

## 2. Using it

welcome-use-title = 2. 在 DApp 中使用
welcome-use-choose = 在 DApp 的钱包列表中，选择 <strong>SignLens</strong>，而不是您的钱包。SignLens 会通过您的钱包连接，您的钱包会照常询问您。
welcome-use-window = 之后，每个请求都会先打开 SignLens 的窗口。请阅读交易会做什么，然后继续前往您的钱包，或拒绝。
welcome-use-reconnect = DApp 会重新连接您上次使用的钱包。如果某个 DApp 直接连接了您的钱包，SignLens 就会被绕过：请在该 DApp 中断开您的钱包，然后选择 SignLens。
welcome-use-wallets = 使用多个钱包？首次连接时，SignLens 会询问将您的请求转交给哪个钱包，并记住您的选择；可在其弹出窗口的设置中更改。

## 3. Pinning it

welcome-pin-title = 3. 将 SignLens 固定到工具栏
welcome-pinned = 已固定：SignLens 已在工具栏上。
welcome-pin-steps = 打开扩展程序菜单（工具栏中的拼图图标）并固定 SignLens：之后，它图标上的角标会显示每个请求的结论，它的弹出窗口会列出这些请求。

## What leaves the browser

welcome-privacy-title = 哪些内容会离开您的浏览器
welcome-privacy-text = 在此测试版中，每笔请您签名的交易都会发送到 SignLens 的 API 进行解释，同时发送您的地址和您地址簿中的地址，以便解释能用“您”来称呼您，并区分您的联系人与相似地址；联系人的名称留在您的浏览器中。服务器保存结论和检查结果代码，不保存交易，除非您选择在评价时一并发送交易。查找表、账户和模拟结果从设置中的 RPC 读取。

welcome-more = 以上所有内容以及更多选项，都在 SignLens 弹出窗口的设置中。
welcome-done = 完成
