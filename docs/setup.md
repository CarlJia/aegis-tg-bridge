# 部署步骤

前置:一个 Cloudflare 账号、一个 Telegram 账号、本机安装 Node.js 与 pnpm。

## 1. 创建 Telegram Bot

1. 在 Telegram 中找 **@BotFather**,发送 `/newbot`。
2. 依次设置显示名与用户名(用户名必须以 `bot` 结尾)。
3. 记录 BotFather 返回的 **token**(形如 `123456:ABC-DEF...`)。
4. 可选:发送 `/setdescription`、`/setabouttext` 完善机器人资料。

## 2. 生成 Webhook Secret

Webhook Secret 用于校验 Telegram 发来的 update 请求。

```bash
openssl rand -hex 24
```

记下这个值(下称 `WEBHOOK_SECRET`),稍后同时配置到 Cloudflare 与 BotFather。

## 3. 创建 Cloudflare 资源

```bash
# 登录
pnpm exec wrangler login

# 创建三个 KV namespace
pnpm exec wrangler kv:namespace create STATE
pnpm exec wrangler kv:namespace create RULES
pnpm exec wrangler kv:namespace create SUMMARY
```

把每条命令返回的 `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]]`(替换 `REPLACE_WITH_*_KV_ID` 占位)。

> 开发隔离:`preview_id` 已在 `wrangler.toml` 中给出一组占位 UUID;`wrangler dev --env dev` 与本地
> miniflare 使用 in-memory KV,不会触碰生产 namespace。生产与预览的 namespace id 必须不同。

## 4. 注入 Secrets

```bash
pnpm exec wrangler secret put BOT_TOKEN
# 粘贴第 1 步的 BotFather token

pnpm exec wrangler secret put WEBHOOK_SECRET
# 粘贴第 2 步生成的值
```

`.dev.vars`(本地开发用,已被 `.gitignore` 忽略)可照 `.dev.vars.example` 填写。

## 5. 部署 Worker

```bash
pnpm exec wrangler deploy
```

记下部署输出的 Worker URL,例如 `https://aegis-tg-bridge.<account>.workers.dev`。

## 6. 绑定 Webhook

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<worker-url>/webhook",
    "secret_token": "<WEBHOOK_SECRET>"
  }'
```

`secret_token` 必须与第 4 步注入的 `WEBHOOK_SECRET` 一致,否则所有请求会被 401 拒绝。

验证:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## 7. 首次使用

1. 用你自己的 Telegram 账号给 Bot 发送 `/start` —— 该账号成为唯一 owner。
2. 用另一个账号(或让朋友)向 Bot 发一条消息 —— 应收到「我确认是本人」按钮。
3. 点击按钮 → 你的 owner 账号应收到「新联系人已加入白名单」通知。
4. 之后该陌生人再发消息,会实时转发给你,前缀形如 `[from @username · chat_id=12345]`。
5. 你在 TG 中用 **reply** 指向转发的消息即可回复(裸消息会收到「请 reply 到具体陌生人消息」提示)。

## 8. 验证 Cron 摘要

Cron 每 5 分钟触发(`wrangler.toml` 的 `[triggers]`)。在 owner 本地时间 22:00 前后(默认 `Asia/Shanghai`),
若当日有拦截记录,会收到「今日拦截 N 条」。用 `wrangler tail` 观察 `scheduled` 触发日志。

## 安全提示

- Cloudflare 账号请启用 **MFA** —— Worker Secret 对任何有 Dashboard 访问权的人可见。
- 不要提交 `.dev.vars`;仓库中不出现明文 token。
- `/revoke <chat_id>` 是即时收回陌生人访问权的路径。
