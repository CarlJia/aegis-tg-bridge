# Aegis — TG 双向聊天机器人

一个部署在 Cloudflare Workers 上的 Telegram Bot,作为"我"与陌生人之间的双向桥:

- 陌生人通过 Bot 用户名发消息,首次需点一次 **「我确认是本人」** 按钮才能进入白名单。
- 白名单内的对话实时转发给 owner,owner 用 TG 原生 **reply** 回给对应陌生人。
- 命中广告规则(关键词 / 链接黑名单 / 营销前缀)的消息被静默丢弃,每日固定时间汇总一条摘要推送给 owner。

本地零进程:全部运行在 Cloudflare Workers + KV + Cron Triggers。

## 目录结构

```
src/
  index.ts              Worker 入口(fetch / scheduled)
  config.ts             env 读取与校验
  kv/store.ts           Cloudflare KV 适配层(唯一持久化出口)
  router/
    webhook.ts          Secret 校验 + update 类型分发
    message.ts          入站消息 routing
    callback.ts         verify 按钮回调(含 from.id 防伪)
  commands/             owner 命令(/start /stats /settings /block /revoke /whitelist)
  flows/
    first-time.ts       陌生人首次入站弹按钮
    owner-message.ts    owner 入站分流(reply 透传 / 裸消息提示)
  rules/
    default.ts          默认广告规则
    engine.ts           规则编译与匹配(含 ReDoS 防护)
  telegram/
    api.ts              TG Bot API 封装
    send.ts             按钮 / 复制消息 / 回执
    forward.ts          陌生人消息转发给 owner
    relay.ts            owner reply 透传给陌生人
  cron/
    summary.ts          每日摘要推送
    cleanup.ts          旧 summary_queue 清理
docs/setup.md           部署步骤(BotFather / Cloudflare / wrangler)
docs/plans/             需求与实现计划
```

## 命令

| 命令 | 作用 |
|---|---|
| `/start` | 绑定 owner(首次调用者成为唯一 owner) |
| `/stats` | 查看今日与近 7 天拦截数 |
| `/settings` | 查看时区与摘要推送时间 |
| `/block <chat_id>` | 加入黑名单,后续静默丢弃 |
| `/revoke <chat_id>` | 移出白名单 |
| `/whitelist <chat_id>` | 手动加入白名单 |

## 本地开发

```bash
pnpm install
pnpm test          # 单元测试(vitest + miniflare)
pnpm typecheck     # tsc --noEmit
pnpm dev           # wrangler dev
```

`pnpm install` 后若构建被拦截,运行 `pnpm approve-builds --all`。

## 部署

见 [docs/setup.md](docs/setup.md)。

## 本地零进程说明

Bot 不依赖任何常驻本地进程 —— Webhook 与 Cron 都由 Cloudflare 边缘触发。
