verdict-not-explained = 未能解释：{ $error }
verdict-message = 消息，按原样显示
verdict-consent = 请求查看观察的地址 { $address }
verdict-address = 声称 { $addresses } 是您的地址，但并非您在 SignLens 中的地址
verdict-list-separator = 、

## The verdict as a tag

verdict-word = { $verdict ->
    [ok] 正常
    [warning] 警告
    [blocked] 已拦截
    [error] 错误
   *[message] 消息
}
