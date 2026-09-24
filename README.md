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
| `/rules [list\|add <词>\|del <词>\|reset]` | 维护屏蔽词(关键词),写入 KV 实时生效 |

命令仅 owner 可用:`/start` 后菜单以 chat scope 只注册到 owner 会话,其他用户在输入框看不到;执行层另有 owner 校验。

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

## Cloudflare 资源限制与收费

本项目**按 Cloudflare 免费额度设计**,正常个人使用不会产生费用。以下数字为免费套餐(Free plan)的日/请求额度,仅供参考,**以 [Cloudflare 官方定价](https://developers.cloudflare.com/workers/platform/pricing/) 为准**(额度会调整)。

### Workers(Free plan)

| 项目 | 免费额度 | 本项目用量 |
|---|---|---|
| 请求数 | 100,000 次/天 | 每条 TG 消息 = 1 次 webhook 请求;Cron 每次触发 = 1 次调用 |
| CPU 时间 | 单次 10 ms | 纯规则匹配 + 少量 KV 读写,远低于上限 |
| Cron Triggers | 免费可用 | `*/5 * * * *`,每天 288 次,计入上面的调用数 |

### Workers KV(Free plan)

| 操作 | 免费额度 | 本项目用量(最紧的是写与 list) |
|---|---|---|
| 读 read | 100,000 次/天 | 每条入站消息数次读(黑白名单、owner、规则等) |
| 写 write | 1,000 次/天 | 白名单变更、拦截审计入队、`/rules` 维护、摘要标记 |
| 删除 delete | 1,000 次/天 | 按钮态清理、`/rules reset`、旧队列清理 |
| list | 1,000 次/天 | 每日摘要 Cron 扫描 summary_queue 键 |
| 存储 | 1 GB | 键值均为小 JSON,单键 < 1 MB 上限 |

> 写、删除、list 三个维度各 1,000 次/天是免费额度里最紧的约束。日常一对一聊天体量远达不到;若把 Bot 公开给大量陌生人,拦截审计的写入(每条命中规则的消息 1 次写)可能逼近上限,届时可考虑合并写入或升级到付费套餐($5/月起,含大幅提升的额度 + 超量按用量计费)。

### KV 一致性提醒

KV 写入经边缘缓存传播,全球生效有 **最长约 60 秒** 延迟(读有 60s 缓存下限)。因此 `/rules` 改动在生产环境最多约 1 分钟后才对所有边缘节点生效;本地 `wrangler dev` 的 miniflare KV 是即时一致的,手动验证会立即看到效果。

## 本地零进程说明

Bot 不依赖任何常驻本地进程 —— Webhook 与 Cron 都由 Cloudflare 边缘触发。
