---
title: TG 双向聊天机器人 - Plan
type: feat
date: 2026-09-23
topic: tg-bidirectional-bridge
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

## Goal Capsule

- **Objective:** 我通过一个 Telegram Bot 在不暴露个人账号的前提下接住陌生人的主动联系,真实消息由我以 TG 原生 reply 模式回给对应陌生人,广告类消息被 Bot 按规则静默拦截后每日汇总给我。本地零进程,整套服务运行在 Cloudflare Workers。
- **Product authority:** 双向桥形态由 Bot 居中 + TG reply 决定;广告屏蔽由规则优先级(关键词、链接黑名单、营销账号前缀)决定;部署由 Cloudflare Workers + Webhook 决定。
- **Means:** 单 Cloudflare Worker module,Webhook 入口,内部按 update 类型分发;KV 作唯一持久层;Cron Trigger 推每日摘要。
- **Open blockers:** 无。

## Product Contract

### Summary

一个 Telegram Bot 作为"我"与陌生人之间的双向桥:陌生人发到 Bot 的消息中,白名单内的对话实时转发给我、我用 TG 原生 reply 回给对应陌生人;未白名单的陌生人必须先点一次"我确认是本人"按钮才能入白名单;命中任何广告规则的消息被后台静默丢弃并在每天固定时间汇总成一条摘要推给我。整个服务在 Cloudflare Workers 上以 Webhook 模式运行,本地零进程。

### Problem Frame

我喜欢被陌生人主动联系——潜在客户、合作、朋友转介——但陌生 TG 消息中混杂大量广告与营销(加密货币拉盘、博彩引流、虚假招聘、刷粉刷量)。我希望:不在公开渠道暴露个人 TG 账号但仍能被联系;不被广告反复打扰;不需要切换工具就能回复。当前市面 Bot 要么只能单向要么强加 Web UI,把产品形态降级,所以我自己搭一个"极简 + 客户端原生"的版本。

### Key Decisions

- **D1. 双向桥形态为 Bot 在中间 + 我 TG 内 reply。** 陌生人通过 Bot 用户名直接发消息;Bot 转发给我;我用 TG 原生 reply 指向 Bot 转发的某条即可回复对应陌生人。*session-settled: user-directed* — 在 Bot 中间 reply / Bot + Web 面板 / Web 主导 + TG 仅通知三个候选中,我选了最简单那个。Governs R3, R4, R5。
- **D2. 广告屏蔽走规则优先。** 关键词正则 + 链接黑名单 + 营销账号前缀表;可手动加白名单;零 LLM 依赖、零第三方 API。*session-settled: user-directed* — 在 规则 / 规则+AI / 纯 AI 三选项中选了"规则优先",因为零外部依赖。Governs R6, R7, R8。
- **D3. 部署目标是 Cloudflare Workers + Webhook,本地零进程。** *session-settled: user-directed* — 在 VPS / PaaS / Docker Compose / CF Workers 四个候选中选 Workers + Webhook。Governs R11, R12, R13。
- **D4. 拦截后处置:静默丢弃 + 每日固定时间摘要推送。** Bot 不回复陌生人;每天固定时间(默认 22:00 用户本地时区)汇总一条"今日拦截 X 条"推给我。*session-settled: user-directed* — 在 静默丢弃 / 礼貌拒绝 / 静默+引导 / 静默+摘要 四个候选中选"静默+摘要"。Governs R7, R8。
- **D5. 陌生人首条消息强制走一次按钮验证 → 验证即入白名单。** *session-settled: user-directed* — 在 无门槛 / 验证后白名单 / 行为学习白名单 / 入站即白名单 四选项中选"按钮验证 + 自动入白"。Governs R1, R2, R6。
- **D6. 验证形式:inline 按钮单次点击。** *session-settled: user-directed* — 在 按钮 / 4 位验证码 / 按钮+身份分类 / 二者皆可 四选项中选"按钮"。Governs R1, R2。
- **D7. 摘要节奏:每日固定时间,默认 22:00。** *session-settled: user-directed*。Governs R7, R10。

### Actors

- **A1. 我:** 已 `/start` Bot 的 TG 用户,产品唯一操作员;同时是 Bot 推送的唯一收件人,也是所有人管命令的发起方。
- **A2. 陌生人:** 通过 Bot @username 触达 Bot 的 TG 用户;可能尚未通过按钮验证,也可能已白名单;只与 Bot 对话。
- **A3. Bot:** TG Bot 账号;作为消息路由与规则执行体,运行时绑定 Cloudflare Worker、KV、Cron Trigger。

### Requirements

**Routing & 双向往返**
- R1. 陌生人首次向 Bot 发消息(含文本、图片、文件)时,Bot 在陌生人 chat 内弹出 inline 按钮"我确认是本人";Bot 不向用户转发该消息也不向陌生人答复,直到按钮被点击。
- R2. 陌生人点击"我确认是本人"后,Bot 将其 `chat_id` 写入 KV `whitelist`,并把按钮触发前的原 update 转发给用户;消息前缀固定为 `[from @username · chat_id=xxxxx]`,便于用户判别来源。
- R3. 已白名单陌生人后续发送的每条消息(文本、图片、文件)需直接转发给用户,并保留转发链映射,使后续 reply 能精确命中。
- R4. 用户在 TG 中 reply 指向 Bot 转发的某条消息后,Bot 通过 `reply_to_message_id` 在 KV `message_map` 解析出目标陌生人 `chat_id`,并将消息内容(文本或媒体)透传给该陌生人;透传内容不附带 Bot 身份签名,陌生人视角只看到一个正常人类回复。
- R5. 用户向 Bot 发送不 reply 的纯文本时,Bot 回复"请 reply 到具体陌生人消息",不向任何陌生人转发;连续裸消息不累积处理,也不写入审计。

**广告规则与拦截审计**
- R6. 每条入站消息(无论是否已白名单)在进入 routing 之前按顺序执行:白名单直通 → 关键词正则 → 链接黑名单 → 营销账号前缀表;命中任一非白名单规则即被拦截。
- R7. 拦截记录写入 KV `summary_queue`,包含 `timestamp`、`chat_id`、`snippet`(消息截断前 200 字)、`rule_hit`(命中的具体规则名)、`has_media`(是否含附件标记);daily cron 在用户本地时间固定点(默认 22:00)按当日数据汇总,经 TG 推送一条摘要消息给我;摘要含"今日拦截 X 条"总数与近 7 天滚动统计,内联按钮"查看详情"按需返回日志快照。
- R8. 拦截后 Bot 不回复陌生人、不影响白名单状态、不影响后续入站;被拦截消息不进入转发队列。

**用户管理命令**
- R9. Bot 支持 `[/start]`, `[/stats](查看拦截快照)`, `[/settings](查看/调整默认推送时间、规则启用状态、白名单条目)`, `[/block <chat_id>](加入黑名单且后续所有入站静默丢弃)`, `[/revoke <chat_id>](从白名单移除,后续入站走 button flow)`, `[/whitelist <chat_id>](手动越过规则,直接加白名单)`。
- R10. `/settings` 中对默认推送时间的调整立即生效;推送时间以用户本地时区计算,默认假定 UTC+8;KV `user_settings` 持久化。

**持久化与部署**
- R11. BotFather token 通过 Cloudflare Workers Secret 注入,仓库代码任何位置不出现明文 token;本地 `.dev.vars` 留 dev 测试用并加入 `.gitignore`。
- R12. 状态全部写入 Cloudflare KV,键空间至少包含 `bot:whitelist`、`bot:blacklist`、`bot:rules`、`bot:message_map:{message_id}`、`bot:summary_queue:{YYYY-MM-DD}`、`bot:user_settings`、`bot:owner_chat_id`、`bot:pending_buttons:{chat_id}`(F1 期间原始消息 id 的 placeholder);写读量在 free tier(每日 10 万读 / 1,000 写 / 1,000 list)以内 —— 写与 list 是最紧的两个维度。
- R13. Worker 是单入口 webhook 处理模块;TG update 路由、callback_query(按钮点击)路由、cron 触发(每日摘要)路由都在同一 Worker 内由类型分发;不依赖长连接、不依赖外部数据库。

### Key Flows

- **F1. 陌生人首条消息弹按钮 + 点按钮入白名单**
  - **Trigger:** 陌生人首次向 Bot 发任何 update(含文本或媒体)。
  - **Steps:**
    1. Worker 收到 update → KV `whitelist` 查询 chat_id,未命中视为未验证。
    2. Bot 在该陌生人 chat 中 sendMessage,携带 inline keyboard `[[{"text":"我确认是本人","callback_data":"verify:{chat_id}"}]]`;原 update 不被转发。
    3. 陌生人点击按钮 → Worker 收到 callback_query;解出 chat_id;写入 `whitelist`;回查该 chat 是否有"待转发的最初一条 update",若有则把它转发给我。
    4. Bot 调用 copyMessage / sendMessage 等把内容推送给我,前缀 `[from @username · chat_id=xxxxx]`。
  - **边界:** 陌生人在点按钮前再次发消息,Worker 仍先跑 F2 的规则引擎;规则命中则按 F2 拦截并审计,与按钮状态无关;未命中则不重复弹新按钮、原按钮提示仍在,继续等待该陌生人点击"我确认是本人"。
  - **Covers R1, R2, R6, R11, R12.**

- **F2. 规则拦截 + 每日摘要**
  - **Trigger:** 任何已白名单或未白名单的入站消息进入规则引擎。
  - **Steps:**
    1. Worker 调用规则引擎,依次做白名单直通 → 关键词正则 → 链接黑名单 → 营销账号前缀表。
    2. 任一规则命中 → KV `summary_queue` 推入 `{date, ts, chat_id, snippet, rule_hit, has_media}`;Bot 不回陌生人;不向用户转发;事件终止。
    3. 未命中 → 进入 F1 / F3 routing(按白名单状态决定弹按钮或转发)。
    4. Cron Trigger 在用户 TZ 22:00 触发,Worker 读 `summary_queue` 中当日数据汇总为一条消息给我;消息内含 inline 按钮"查看详情",callback 后返回近 7 天快照。
  - **Covers R6, R7, R8.**

- **F3. 我 reply → 透传给目标陌生人**
  - **Trigger:** 我在 Bot 内用 reply 指向 Bot 转发的某条消息(M1)。
  - **Steps:**
    1. Worker 检测 `reply_to_message` 存在且 reply 目标是 Bot 自己转发的历史消息。
    2. 用 reply 的 message_id 在 KV `message_map` 查到目标 `chat_id`。
    3. Worker 调 sendMessage / sendPhoto / sendDocument 把内容透传给该 chat_id;不附 Bot 签名(走 sendMessage 而非 forward,确保无 forwarding header)。
    4. 用户端发件视角无回执;但失败时给我一条"消息未送达 X"的提示。
  - **边界:** 我发裸消息(非 reply)走 R5:Bot 回复提示而不转发。
  - **Covers R3, R4, R5.**

- **F4. /start 与 onboarding**
  - **Trigger:** 我在 TG 中发 `/start`。
  - **Steps:**
    1. Bot 写 KV `owner_chat_id`(单值)。
    2. Bot 回复欢迎语 + 命令清单(`/stats`、`/settings`、`/block <id>`、`/revoke <id>`、`/whitelist <id>`)。
  - **Covers R9, R10.**

### Acceptance Examples

- **AE1. 陌生人首条非广告消息的引导。** *Covers R1, R2.*
  - **Given:** 陌生人 X 尚未点过"我确认是本人"按钮。
  - **When:** X 向 Bot 发送"找你谈合作"。
  - **Then:** Bot 在 X 的 chat 里给出 inline 按钮提示;用户 TG 不收到任何转发;KV `summary_queue` 不增加(因未命中规则)。
  - **And:** 紧接着 X 再发"请问在吗",行为同上,Bot 不重复弹按钮。

- **AE2. 按钮点击入白名单。** *Covers R2, R12.*
  - **Given:** AE1 后 X 点击"我确认是本人"。
  - **Then:** KV `whitelist` 写入 X 的 chat_id;Bot 把 AE1 起始那条 update 转发给我,前缀格式精确为 `[from @X 或 first_name · chat_id=xxxxx]`。
  - **And:** 之后 X 再发的每条消息,Worker 直接转发,不再弹按钮。

- **AE3. 规则命中拦截。** *Covers R6, R7, R8.*
  - **Given:** 陌生人 Z(未白名单)直接向 Bot 发"usdt 搬砖日入过千 https://example.com/promo"。
  - **When:** Worker 规则引擎命中关键词 "usdt" 和/或链接黑名单 `example.com/promo`。
  - **Then:** KV `summary_queue` 写入 `{date, ts, Z.chat_id, "usdt 搬砖日入过千 https://...", rule_hit="keywords+links", has_media=false}`;Bot 不向用户转发;Z 的 chat 中无任何回复。
  - **And:** 在当日 22:00,我收到一条"今日拦截 1 条",inline 按钮"查看详情"可拉出近 7 天日志快照。

- **AE4. TG reply 精确透传。** *Covers R3, R4.*
  - **Given:** Bot 把 X 的消息 M1 转发给我。
  - **When:** 我用 reply 指向 M1 发"收到,明天下午"。
  - **Then:** Bot 透传"收到,明天下午"给 X;X 视角无 Bot 签名、无 forwarded-from header;我端无回执。
  - **And:** 我端没有 reply 的另一条消息 M2(Y 来源)与本次 reply 不相干,Y 不会被影响。

- **AE5. 裸消息歧义回退。** *Covers R5.*
  - **Given:** 我先后看到 Bot 转发的 M1(来自 X)与 M2(来自 Y)。
  - **When:** 我不 reply 直接发"你好"。
  - **Then:** Bot 回复我"请 reply 到具体陌生人消息";X、Y 都不收到这条消息;无消息转发审计。

- **AE6. /revoke 撤销白名单。** *Covers R9.*
  - **Given:** X 已白名单。
  - **When:** 我发 `/revoke X.chat_id`。
  - **Then:** KV `whitelist` 删除 X;X 后续发消息走未白名单路径(弹按钮);不留下审计或拦截记录(除非规则命中)。

### Scope Boundaries

**Deferred for later(不在 v1)**
- 历史会话全量持久化与查询界面(需要 D1 / R2 类的关系数据库,CF KV 表达力不够)。
- 行为学习白名单(基于用户的 reply 频率自动加白或自动移除)。
- 多用户 / 多账号"我"的切换(目前只支持单一 owner_chat_id)。
- 验证码式反机器人升级(目前按钮足够;为反脚本再加 4 位验证码留作 v2)。
- 群消息或频道消息作为陌生人入口。
- Web 控制面板(回看历史、白名单编辑、广告规则表单调节)。

**Outside this product's identity**
- 不接管我个人 TG 账号的对外可见身份;陌生人在 TG 中始终是和一个 Bot 对话,而不是和我本人。
- 不接入任何 LLM 或第三方 AI 服务做消息判定,广告识别只用规则匹配。
- 不提供任何对外的 Web / 移动 UI;一切交互均在 TG 客户端内完成。

### Dependencies / Assumptions

- 用户在 BotFather 创建 Bot 并把 token 通过 Cloudflare Dashboard → Worker Settings → Variables / Secrets 注入;仓库代码与 PR 不出现明文 token。
- 用户有 Cloudflare 账号,可创建 Worker、KV namespace、绑定 Webhook URL、设置 Cron Trigger。
- 默认时区假设 UTC+8;若不在该时区需在 `/settings` 中调整。
- Cloudflare Workers free tier(KV 每日 10 万读 / 1,000 写 / 1,000 list,Workers 10 万请求/天,cron 5 分钟粒度)在本项目预期消息量级内可用;KV 写与 list 是最紧的维度,cron 清理已限为每 UTC 日一次以省 list。
- TG 入站消息当前只接受 private 消息(不做群 / 频道入口)。
- 单 owner、单 Bot、单 Worker 部署;不设多租户。

### Outstanding Questions

**Resolve Before Planning**
- 无。

**Deferred to Planning**
- KV 键名命名规范与 TTL 设计(尤其是 `summary_queue` 的滚动清理策略)。
- 规则文件加载方式(代码内 bundle 静态规则,还是 KV 中加载可热更新版本)。
- Cron Trigger 在用户跨时区 / DST 切换时的实现细节(用 cron 表达式偏移还是用队列延迟补齐)。
- Worker 重试与失败注入处理(TG 调用失败的退避、KV 写失败的兜底、消息幂等保证)。
- 媒体附件(图片、文件)的转发与存储策略:超 20MB 时 TG 走直传 / Cloudflare R2 暂存,需要在 plan 中选定。

### Sources / Research

- Cloudflare Workers free tier 文档(KV 读写额度、Cron Trigger 限制)。
- Telegram Bot API 文档:Webhook vs Long Polling、callback_query 类型、sendMessage 不带 forwarded 标记的可用性。
- 无外部 Compound Pack 引用;无仓库内既有路径引用(项目新建)。

> **Product Contract preservation:** Product Contract unchanged. Planning enrichment adds Planning Contract, Implementation Units, Verification Contract, Definition of Done below;Key Decisions D1–D7、Requirements R1–R13、Flows F1–F4、Acceptance Examples AE1–AE6 的 ID 与原义保持不变。

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Worker 单 module + 内部 router 分派。** Worker 入口是单个 `src/index.ts`,导出 `fetch` 与 `scheduled` 两个 handler;update 类型(`message` / `callback_query` / `edited_message`)在 router 内部 `switch`;优势是冷启动一次就把 KV reads + 规则编译全部 inline cache,无 fork 节点。*session-settled: user-directed — chosen over 多 worker split: 避免跨 worker 调用与 KV 多次往返。* Governs R13。
- **KTD2. KV 键空间统一 `bot:` 前缀,按用途分桶。** `bot:whitelist`、`bot:blacklist`、`bot:user_settings`、`bot:owner_chat_id` 是单值 / Set 风格 JSON 序列化;`bot:rules`、`bot:message_map:{message_id}`、`bot:summary_queue:{YYYY-MM-DD}` 是单条记录;TTL 设计:`message_map` 30 天(reply 命中窗口),`summary_queue` 7 天(Cron 清理);`whitelist`、`blacklist`、`user_settings`、`rules` 长期保留。*session-settled: user-directed — chosen over 单 megakey: 拒绝 hotspot,KV free tier 单 key 1 MB 上限内。* Governs R12。
- **KTD3. 规则引擎在 module top-level 编译一次,KV 覆盖热加载。** 默认规则作为代码常量在 `src/rules/default.ts`,在 Worker 冷启动时 `RegExp` 编译一次,缓存到 module 闭包;KV `bot:rules` 存在时,Worker 首请求 lazy-load 并热替 in-memory regex;命中短路。零外部依赖。Governs R6。
- **KTD4. cron 全局 5 min + tz-aware dispatcher 模式。** Workers Cron Trigger 每 5 分钟触发一次(`crons = ["*/5 * * * *"]`);handler 读 `bot:user_settings`,对每个 owner 计算其 TZ 下当前是否落在目标时刻(默认 22:00,±2.5 min 容忍窗口),命中则调 sendMessage。该方案在 free tier 下扩展性比 per-user cron 表达式好,且 timezone / DST 切换通过下次 cron 重新计算自动适配。Governs R7, R10。
- **KTD5. Webhook 入口用 `X-Telegram-Bot-Api-Secret-Token` header 校验。** 在 `src/index.ts` 的 `fetch` handler 起手用 `crypto.subtle.timingSafeEqual` 比对 `env.WEBHOOK_SECRET`;不一致直接 `return new Response(null, { status: 401 })`;不依赖 IP 白名单(CF Worker 的来源 IP 是边缘节点,动态)。Governs R11, R13。
- **KTD6. Reply 透传走 `sendMessage`/`sendPhoto`/`sendDocument`,不走 `forwardMessage`。** `forwardMessage` 会带 forwarded-from header;`copyMessage` 也带。`sendMessage` 等直接无签名,符合陌生人视角"和真人对话"的要求;按消息类型 switch 分派到对应 endpoint。Governs R4。
- **KTD7. 内部消息转发也走 `copyMessage` 而非重新构造文本。** `copyMessage` 保留原消息所有内容(图、视频、文件、sticker),Worker 不需要去理解消息类型;Bot 无法解析的格式(后续 TG 增加的类型)也兜底直接 copy;failover:若 copyMessage 失败(单条 50MB 上限等),降级到 sendMessage 提示用户。Governs R3。
- **KTD8. 命令路由 `switch(update.message.text.split(' ')[0])`。** 不引入框架(无 grammY / telegraf);每个命令单独一个文件导出 `handler(ctx)`;只在 owner 入站消息时 dispatch,非 owner 静默忽略。Governs R9。
- **KTD9. Callback_query 路由按 `data` 字段分派,`data` 用 `verify:{chat_id}` 编码;handler 必须比对 `callback_query.from.id` 与解出的 chat_id 一致后才写 whitelist。** 防止外部捏造的 callback 把任意受害者加入白名单。Governs R2, R10。
- **KTD10. 时区计算用 `Intl.DateTimeFormat(timeZone)` 在 Worker runtime 内联展开。** 不引入 luxon / dayjs;CF Workers runtime 支持 `Intl`(自 2022 起);cron handler 比较 `format({hour: 'numeric', hour12: false})` 与 owner 设置值。Governs R7, R10。

### Implementation-time Assumptions

- KV namespace 三个:`STATE`、`RULES`、`SUMMARY`。U1 实施时分别 `wrangler kv:namespace create` 三个,把 ID 填入 `wrangler.toml` 的 `[[kv_namespaces]]`。
- `message_map` 的 reply 命中窗口取 30 天(过期后只可能丢失远超过 30 天的 reply,这类 edge 不在 v1 服务范围内;若发生,owner 收到"找不到对应陌生人"提示)。
- `summary_queue:{YYYY-MM-DD}` 键的 TTL 在写入时通过 KV `expiration` 字段设为 7 天(CF KV 支持),cron handler 每 UTC 日仅一次(用 `bot:last_cleanup` marker 门控)list + delete 8 天前的键以避免膨胀,省 free tier 的 list 额度。
- `pending_buttons:{chat_id}` TTL 7 天,点过按钮或不再接收的陌生人 kv 键自然过期清理。
- `last_summary:{owner_id}:{YYYY-MM-DD}` TTL 8 天作为 cron idempotency marker,发送成功后写入,下次 cron 若存在则跳过推送。
- 规则的首版以 `src/rules/default.ts` 中静态 regex 数组编译;KV 覆盖仅在 `bot:rules` 存在且 JSON 解析成功时启用;解析失败时,Worker 在 `console.warn` 后回退到默认规则。
- 单 owner、单 Bot 假设下,`bot:owner_chat_id` 取字符串单值;若多 owner,需扩展为 `bot:owners:{chat_id}`,但 v1 不做。
- 媒体(photo / document / video / voice / sticker)统一走 `copyMessage`;TG Bot API 单文件上限 50 MB 覆盖绝大多数用例;超 50 MB 的场景 v1 不优雅降级,以 console.warn 提醒 owner 手动处理。
- 测试用 vitest + `@cloudflare/vitest-pool-workers`(miniflare);集成测试场景用伪造 update 直接 `worker.fetch(req)` 触发完整路由。
- Cron handler 失败时不重试,但写 `last_cron_status` 到 KV 供 `wrangler tail` 检查;避免 silent failure。
- Webhook Secret Token 在 BotFather `/setwebhook` 时设置;BotFather 默认 webhook 不强制 secret,需要在 setwebhook 时附带 secret_token 参数。

---

## Implementation Units

### U1. Worker 脚手架、配置、KV 适配层

- **Goal:** 准备可在本地与生产运行的 Cloudflare Worker 骨架,KV namespace 绑定、Secret 注入、KV 操作最小封装三件齐备。
- **Requirements:** R11, R12。
- **Dependencies:** 无。
- **Files:**
  - `wrangler.toml`(新建)— Worker 名称、`compatibility_date`、`[[kv_namespaces]]` 三个 binding(`STATE` / `RULES` / `SUMMARY`)、`[triggers] crons`、`[vars]`。
  - `package.json`(新建)— scripts(`dev` / `deploy` / `test` / `test:integration` / `typecheck`)、devDependencies(`wrangler`、`vitest`、`@cloudflare/vitest-pool-workers`)。
  - `.dev.vars.example`(新建)— `BOT_TOKEN=`、`WEBHOOK_SECRET=` 占位。
  - `.gitignore`(新建)— `node_modules/`、`.dev.vars`、`dist/`、`.wrangler/`。
  - `src/index.ts`(新建)— Worker 入口,导出 `fetch` (返回 200 占位)与 `scheduled`(返回空)。
  - `src/config.ts`(新建)— 从 `env` 读 `BOT_TOKEN`、`WEBHOOK_SECRET`、KV namespace bindings。
  - `src/kv/store.ts`(新建)— KV 适配层:`getWhitelist / setWhitelist / addToWhitelist / removeFromWhitelist`、`getBlacklist / addToBlacklist / removeFromBlacklist`、`getRules / setRules`、`getMessageMap(mid) / setMessageMap(mid, val)`(TTL 30 天)、`getPendingMessageId(chat_id) / setPendingMessageId(chat_id, mid)`(TTL 7 天)/ `deletePendingMessageId(chat_id)`、`pushSummary(date, entry)`、`getSummary(date)`、`getLastSummary(owner_id, date) / setLastSummary(owner_id, date, ts)`(TTL 8 天,幂等 marker)、`getOwnerChatId / setOwnerChatId`、`getUserSettings / setUserSettings`。
  - `src/__tests__/kv/store.test.ts`(新建)— 单元测试,覆盖读写。
- **Approach:** 单 module、TypeScript、Wrangler 4.x;`src/kv/store.ts` 接收 `KVNamespace` 实例并对路径命名封装在内部;`message_map` 写时显式 `expirationTtl: 60 * 60 * 24 * 30`;`summary_queue` 写时 `expirationTtl: 60 * 60 * 24 * 7`。
- **Test scenarios:**
  - `addToWhitelist('123')` 后 `getWhitelist()` 含 `'123'`;`removeFromWhitelist('123')` 后不再含。
  - `setMessageMap('m1', 'chat:123')` 后 `getMessageMap('m1')` 返回 `'chat:123'`;TTL 字段传入 ≥ 1。
  - `pushSummary('2026-09-23', {ts, chat_id, snippet, rule_hit, has_media})` 后 `getSummary('2026-09-23')` 包含该条目。
  - `setOwnerChatId('999')` 后 `getOwnerChatId()` 返回 `'999'`。
  - `setUserSettings('999', {timezone: 'Asia/Shanghai', summaryTimeHour: 22})` 后 `getUserSettings('999')` 返回该 JSON。
- **Verification:** `pnpm test` 全绿;`wrangler dev` 启动无报错且访问根路径返回 200;"`pnpm tsc --noEmit`" 类型检查通过。

### U2. Webhook 路由 + update 分发 + 鉴权

- **Goal:** TG Webhook 入口完成 secret 校验并按 update 类型分派到 message / callback handler。
- **Requirements:** R11, R13。
- **Dependencies:** U1。
- **Files:**
  - `src/router/webhook.ts`(新建)— `handleWebhook(req, env)`:校验 header、按 update 类型 dispatch。
  - `src/router/message.ts`(新建)— `handleMessage(message, env)` stub,后续 unit 填充。
  - `src/router/callback.ts`(新建)— `handleCallbackQuery(query, env)` stub。
  - `src/index.ts`(修改)— 在 `fetch` handler 中分出 webhook 路径(路径 `/webhook`)与 health 路径(根返回 200)。
  - `src/__tests__/router/webhook.test.ts`(新建)— 单元测试,模拟 Request + env。
- **Approach:** `crypto.subtle.timingSafeEqual` 比对 secret;长度不一致或 ASCII 不匹配直接 401;Path 决策用 URL:webhook 在 `/webhook` 仅接受 POST 且必须过 secret 校验,根路径返回 200 + 'ok',其他路径返回 200 但不进入 dispatch;`update.message` 与 `update.edited_message` 都走 message handler,`update.callback_query` 走 callback handler,其它类型返回 200 + `console.log` 调试行。`scheduled` export 由 KTD1 独立 cron 触发,不走 fetch,不参与 secret 校验。
- **Test scenarios:**
  - 缺少 `X-Telegram-Bot-Api-Secret-Token` 的 POST `/webhook` 返回 401,且 message handler 未被调用。
  - 携带正确 secret 的 POST `/webhook` 含 `update.message`,message handler 被调用一次;响应 200。
  - 携带正确 secret 的 POST `/webhook` 含 `update.callback_query`,callback handler 被调用一次;响应 200。
  - `update.edited_message` 不调用任何 handler,响应 200。
  - GET 根路径返回 200 "ok"。
- **Verification:** `pnpm test` 全绿;`curl -X POST https://<worker>/webhook -d '{}' -H 'X-Telegram-Bot-Api-Secret-Token: <wrong>'` 收到 401;正确 secret 收到 200。

### U3. 规则引擎

- **Goal:** 编译关键词、链接、营销前缀三类规则为可复用 `evaluate(msg) → { hit, rule? }` 函数;首版用 KV 默认规则覆盖。
- **Requirements:** R6。
- **Dependencies:** U1。
- **Files:**
  - `src/rules/default.ts`(新建)— 默认规则:`keywords` 正则数组、`links` host 后缀数组、`marketing_prefixes` 字符串数组。
  - `src/rules/engine.ts`(新建)— `compile(rules)` → `evaluate(message): { hit: boolean; rule?: string }`;`getEngine(env)` 在 KV 存在 rules 时返回 KV-覆盖规则,否则默认规则。
  - `src/__tests__/rules/engine.test.ts`(新建)。
- **Approach:** 默认规则编译到模块闭包顶层(`const DEFAULT_ENGINE = compile(DEFAULT_RULES)`);KV `bot:rules` 存在时,首次调用 lazy-load,缓存一个 in-memory engine 实例;`evaluate` 顺序:keywords → links → marketing_prefixes;返回首个命中。rule 编译前对每条 pattern 做 sanity check:拒绝嵌套量化符(如 `(a+)+`)、拒绝对同一字符类量化超 5 次;若拒绝,`console.warn` 并跳过该 pattern。
- **Test scenarios:**
  - 输入含 "usdt 搬砖" → 命中 `keywords`,`rule: 'keywords'`。
  - 输入含 `https://example.com/promo` → 命中 `links`,`rule: 'links'`。
  - 输入同时含关键词与链接 → 返回首个规则的命中(实现细节:`keywords` 在前则返回 `keywords`)。
  - 输入 "我来自小米,想合作" 纯文本 → `{ hit: false }`。
  - `bot:rules` KV 写入 `[{"type":"keywords","patterns":["foo"]}]`,`getEngine` 第二次调用返回 KV 引擎。
- **Verification:** `pnpm test` 全绿;`wrangler dev` 中 `console.log(getEngine(env).evaluate('usdt 搬砖'))` 输出 `{ hit: true, rule: 'keywords' }`。

### U4. 用户 onboarding + 管理命令

- **Goal:** 实现六个 owner 命令(`/start`、`/stats`、`/settings`、`/block <id>`、`/revoke <id>`、`/whitelist <id>`),仅 owner 可调用,KV 写入正确。
- **Requirements:** R9, R10。
- **Dependencies:** U1, U2。
- **Files:**
  - `src/commands/index.ts`(新建)— `dispatch(message, env)`:从 `bot:owner_chat_id` 判断是否为 owner,否则不响应;按 `text.split(' ')[0]` 分派。
  - `src/commands/assert-owner.ts`(新建)— `assertOwner(message, env)`:每个命令 handler 在 mutate KV 之前独立调一次;非 owner 抛错并由 dispatch 静默吞掉,防止路由层漏判时也守住隐私命令。
  - `src/commands/start.ts`(新建)— `/start` handler:写 `bot:owner_chat_id`、回复欢迎语 + 命令清单。
  - `src/commands/stats.ts`(新建)— `/stats` handler:读 `bot:summary_queue:{YYYY-MM-DD}` 计数,显示今日 + 近 7 天拦截数。
  - `src/commands/settings.ts`(新建)— `/settings` handler:展示当前 `user_settings`,inline keyboard("推送时间 +1h" / "-1h" / "关闭")。
  - `src/commands/block.ts`、`revoke.ts`、`whitelist.ts`(新建)— 各自 handler,根据目标 chat_id 写对应 KV 集合。
  - `src/__tests__/commands/*.test.ts`(新建)— 每个 handler 一个文件。
- **Approach:** 每个命令一个文件,导出 `handler(ctx)`;`ctx = { message, env, kv }`;非 owner 调用一律 `return`(不发给调用者);TG API 调用用 `sendMessage`/`answerCallbackQuery`,统一从 `src/telegram/api.ts` 抽出(本 unit 仅 inline 调用,后续 unit 复用)。
- **Test scenarios:**
  - **Test scenario 1 (Covers R9):** 非 owner chat_id A 发 `/start`,Bot 不发任何回复;`bot:owner_chat_id` 未变。
  - **Test scenario 2:** A 再次发 `/start` 仍被忽略;但 A 同时发"非命令文本"(当作陌生人消息处理,后续 unit 测试覆盖)。
  - **Test scenario 3:** owner chat_id O 发 `/start`,`bot:owner_chat_id` 被写入 O;Bot 回复欢迎语 + 命令清单。
  - **Test scenario 4:** owner 发 `/block 999`,`bot:blacklist` 含 `999`;发 `/revoke 999`,`bot:blacklist` 删除 `999`;发 `/whitelist 999`,`bot:whitelist` 含 `999`。
  - **Test scenario 5:** owner 发 `/settings`,Bot 回复当前设置 + inline keyboard;点 "推送时间 +1h" 后 `bot:user_settings` 的 `summaryTimeHour` + 1。
- **Verification:** `pnpm test` 全绿;`wrangler dev` 真实发 `/start` 给 Bot,Bot 回复欢迎语,`wrangler kv:list` 能看到 `bot:owner_chat_id` 被写入。

### U5. 陌生人首次入站弹按钮 + 验证

- **Goal:** 陌生人首次发消息时弹 inline 按钮;点过按钮后 Bot 把原消息转发给 owner 并加白名单。
- **Requirements:** R1, R2, R3(部分)。
- **Dependencies:** U1, U2, U4。
- **Files:**
  - `src/flows/first-time.ts`(新建)— `handleFirstTime(message, env)`:发送带 `verify:{chat_id}` callback_data 的 inline 按钮。
  - `src/telegram/send.ts`(新建)— `sendVerifyButton(chat_id, env)`、`copyMessageToOwner(chat_id, message, env)`、`answerCallbackQuery(query_id, text, env)`。
  - `src/router/callback.ts`(修改)— `handleCallbackQuery` 解 `callback_data`(`verify:{chat_id}`),写 `bot:whitelist`,再调 `copyMessageToOwner` 把"待转发"消息(在 U6 中持久化)复制给 owner。
  - `src/__tests__/flows/first-time.test.ts`(新建)。
- **Approach:** 收到非 owner 的 message,若 `bot:whitelist` 不含该 chat_id 且 `bot:blacklist` 不含:若是首次,先 `setPendingMessageId(chat_id, message.message_id)`(TTL 7 天)+ 调规则引擎,未命中则 sendMessage + inline_keyboard,已弹过按钮但未点击则不重复弹、继续等待 verify。
- **Test scenarios:**
  - **Test scenario 1:** chat_id `X` 未在 whitelist → 调用 `sendVerifyButton` 一次,`copyMessageToOwner` 未被调用。
  - **Test scenario 2:** chat_id `X` 在 whitelist → 不调用 `sendVerifyButton`,调用 `copyMessageToOwner`。
  - **Test scenario 3:** callback_query `data="verify:X"` → 写 whitelist,`sendVerifyButton` 后续 message 不再发送。
  - **Test scenario 4:** `verify:X` callback 后调用 `copyMessageToOwner` 转发 pending 消息。
- **Verification:** `pnpm test` 全绿;手动或集成测试:陌生人发消息 → Bot 给陌生人发按钮消息 → 点按钮 → owner 收到原消息。

### U6. 入站消息 routing(白名单直通 + 规则拦截 + 拦截审计 + 裸消息回退)

- **Goal:** `handleMessage` 实现完整 routing 决策:owner 命令 / 已白名单直转发 / 规则拦截审计 / 未白名单弹按钮 / owner 裸消息回退。
- **Requirements:** R3, R5, R6, R7, R8。
- **Dependencies:** U2, U3, U4, U5。
- **Files:**
  - `src/router/message.ts`(修改)— 完整实现 `handleMessage`;调用顺序:`isOwner? → commands.dispatch; isWhitelisted? → forwardToOwner; isBlacklisted? → silent; rules.hit? → pushSummary + silent; else → first-time button`。
  - `src/flows/owner-message.ts`(新建)— `handleOwnerMessage(message, env)` 处理 owner 入站的 reply / 裸消息分支(调用 U7 的 relay、U5 的 forward)与命令 dispatch。
  - `src/telegram/forward.ts`(新建)— `forwardToOwner(stranger_chat_id, message, env)`:copyMessage 给 owner,前缀 `[from @username · chat_id=xxxxx]` 添加进 text/caption;记录 `bot:message_map:{owner_message_id}` = `{ stranger_chat_id, expires_at: now+30d }`(TTL 30 天)。
  - `src/telegram/api.ts`(新建)— 集中封装 TG `sendMessage`/`copyMessage`/`answerCallbackQuery` 调用,统一错误处理(log + 失败返回 owner 提示)。
  - `src/__tests__/router/message.test.ts`(新建)— 路由分支全覆盖。
- **Approach:** `handleMessage` 一次路由决策,`switch (await classify(message, env))`;`classify` 是纯函数(读 KV → 返回 owner/whitelisted/blacklisted/passed-rules/first-time)。每条路径单一责任。`message_map` 写时 `expirationTtl: 60*60*24*30`。
- **Test scenarios:**
  - **Test scenario 1 (Covers AE3, R6, R7):** chat_id `Z` 未在 whitelist、未在 blacklist,message 含 "usdt" 关键词 → 调用 `rules.evaluate` 命中 keywords → 写 `summary_queue` 一条 → 不调用 copyMessageToOwner / sendVerifyButton。
- **Test scenario 1b (Covers AE1, R1):** chat_id `X` 未在 whitelist、首次 message 已处理且已写 `bot:pending_buttons:X`(Worker 处于"等待 verify"状态),X 再次发非规则命中消息 → handleFirstTime 调规则引擎未命中、不调 sendVerifyButton、不调 copyMessageToOwner;`bot:summary_queue` 不增加。
  - **Test scenario 2 (Covers AE2, R3):** chat_id `X` 在 whitelist,发 "你好" → copyMessageToOwner 调用一次,`message_map` 写入 owner_message_id → X 的 chat_id。
  - **Test scenario 3 (Covers AE5, R5):** chat_id `O`(owner)发非命令、非 reply 的裸消息 → Bot 用 sendMessage 给 O 回复 "请 reply 到具体陌生人消息";不调任何 stranger 的 sendMessage / copyMessage。
  - **Test scenario 4:** chat_id `B` 在 blacklist,发任何 message → 函数静默 return,无 KV 写入、无 sendMessage。
  - **Test scenario 5:** owner 发 `/block 999` (走 commands.dispatch),`bot:blacklist` 写入 `999`。
- **Verification:** `pnpm test` 全绿;集成测试用 miniflare 完整跑过 AE1-AE6。

### U7. 我 reply 透传 + 裸消息歧义回退

- **Goal:** owner 在 TG 中 reply Bot 转发的某条消息,Bot 解析 `reply_to_message.message_id` → chat_id,透传给该陌生人;reply 不在 message_map 时给 owner 错误提示。
- **Requirements:** R3, R4, R5。
- **Dependencies:** U6, U4。
- **Files:**
  - `src/telegram/relay.ts`(新建)— `relayToStranger(owner_message, env)`:`message.reply_to_message.message_id` → KV `bot:message_map:{id}` → `chat_id`;按 owner_message 类型选 sendMessage / sendPhoto / sendDocument;`reply_to_message` 不存在走 `promptReplyToSpecific`。
  - `src/flows/owner-message.ts`(修改)— `handleOwnerMessage`:reply 路径调 `relayToStranger`;裸消息走 `promptReplyToSpecific`(给 owner 提示)。
  - `src/__tests__/telegram/relay.test.ts`(新建)。
- **Approach:** relay 单层逻辑,不引入 framework;`message_map` 缺失静默给 owner 提示;失败时 TG API call 的 catch 上抛到 owner(用 sendMessage 给 owner 通知)。
- **Test scenarios:**
  - **Test scenario 1 (Covers AE4, R3, R4):** `bot:message_map:{M1}` 映射到 chat_id `X`,owner 发 reply `reply_to_message.message_id=M1`,内容"收到,明天下午" → sendMessage 给 X,且不附 reply_to_message(避免显示原始 Bot 消息)、不加 bot prefix。
  - **Test scenario 2 (Covers AE5):** owner 发裸消息 "你好"(无 reply) → Bot 给 owner 发提示"请 reply 到具体陌生人消息",未调任何 stranger endpoint。
  - **Test scenario 3:** owner reply 一条不是 Bot 转发的消息(例如 reply 自己的旧消息)→ Bot 给 owner 发"找不到对应陌生人"。
  - **Test scenario 4:** owner 发包含 photo 的 reply → sendPhoto 给目标 stranger;caption 保留。
- **Verification:** `pnpm test` 全绿;集成测试 miniflare 模拟完整 AE4 链路。

### U8. 每日摘要推送(Cron Trigger + tz-aware dispatcher)

- **Goal:** Worker cron handler 在 owner TZ 22:00(±2.5 min)向 owner 推送当日拦截摘要;同时清理前 8 天的 `summary_queue` 旧键。
- **Requirements:** R7, R10。
- **Dependencies:** U1, U4, U6。
- **Files:**
  - `src/cron/summary.ts`(新建)— `handleCron(env)`:遍历 `bot:user_settings`,对匹配当前 TZ 时刻的 owner 调 sendMessage;读当日 `bot:summary_queue:{YYYY-MM-DD}`,send "今日拦截 X 条" + inline "查看详情" 按钮。
  - `src/cron/cleanup.ts`(新建)— list KV keys `bot:summary_queue:*`,删除 8 天前日期的 key;由 `summary.ts` 的 `maybeCleanup` 每 UTC 日调用一次(`bot:last_cleanup` marker 门控),而非每次 cron tick。
  - `src/index.ts`(修改)— 导出 `scheduled(event, env, ctx)` 调用 summary handler;`ctx.waitUntil` 包住 cleanup。
  - `wrangler.toml`(修改)— `[triggers] crons = ["*/5 * * * *"]`。
  - `src/__tests__/cron/summary.test.ts`(新建)。
- **Approach:** 用 `Intl.DateTimeFormat({ timeZone: settings.timezone, hour: '2-digit', minute: '2-digit', hour12: false })` 计算 owner 的当前 clock hour:minute;当前 cron 触发时间(UTC)除以 5 → epoch 5-min slot;只有当 owner 时区的 floor(5-min slot) == settings.summaryTimeHour 时触发推送;cleanup 用 `KV.list({prefix: "bot:summary_queue:"})` 然后删过期 key;幂等性:发送前读 `bot:last_summary:{owner_id}:{YYYY-MM-DD}`,存在则跳过,发送成功后写入该键(TTL 8 天)。
- **Test scenarios:**
  - **Test scenario 1 (Covers AE3, R7):** `bot:summary_queue:2026-09-23` 含 1 条,owner user_settings.summaryTimeHour = 22,Asia/Shanghai TZ;模拟 cron at UTC 14:00(Asia/Shanghai 22:00)→ 调 sendMessage 给 owner "今日拦截 1 条",内含 "查看详情" 按钮。
  - **Test scenario 2:** owner user_settings.timezone = 'America/New_York' (UTC-5),summaryTimeHour = 21;cron at UTC 02:00 (NY 21:00)→ 命中推送。
  - **Test scenario 3:** cron at UTC 14:30 → 不对任何 owner 推送(floor(5-min slot) = 14:30 但 owner TZ 22:00 的对应 UTC 时刻为 14:00,5-min slot 不会在 22:00 ±5 min 容忍窗口内命中)。
  - **Test scenario 4:** cleanup:mock KV list 返回 keys 含 `bot:summary_queue:2026-09-14`(8 天前),删除之;`bot:summary_queue:2026-09-22`(昨天)保留。
- **Verification:** `pnpm test` 全绿;`wrangler dev` + `wrangler scheduled` 调用本地 cron 模拟;`pnpm vitest` 集成测试模拟 scheduled event。

### U9. 部署 + 文档 + 集成 smoke 测试

- **Goal:** 提供 README、setup 文档、BotFather 设置说明;集成测试覆盖端到端 F1 + F3 + 拦截审计 + 每日摘要链路。
- **Requirements:** R11, R13。
- **Dependencies:** U1-U8。
- **Files:**
  - `README.md`(新建)— 项目简介、目录结构、命令清单、本地开发步骤、测试步骤、部署步骤概要。
  - `docs/setup.md`(新建)— BotFather 创 Bot、setwebhook 带 secret_token、CF Dashboard 创建 KV namespace + bindings、wrangler secret put 注入、`wrangler deploy`、首次 `/start` 验证;开发环境 `wrangler dev --env dev` 指向本地 miniflare in-memory KV,严格隔离 dev 与 prod KV namespace;CF Dashboard 启用 MFA。
  - `tests/integration/e2e.test.ts`(新建)— 端到端:陌生人入站 → 点按钮 → owner 收消息 → owner reply → stranger 收消息 → 广告拦截 → summary 推送。
  - `vitest.config.ts`(新建)— 配置 `@cloudflare/vitest-pool-workers`,集成测试在 Worker 运行时内执行。
- **Approach:** integration test 用 miniflare 模拟 KV 与 Worker runtime;伪造 TG API 用 fetch interception(本地 mock endpoint `tg-api.local`);cron test 用 `wrangler scheduled` 路径或显式调用 `handleCron`。
- **Test scenarios:**
  - **Test scenario 1:** E2E happy path:陌生人 X 点按钮 → owner 收 M1 → owner reply M1 → X 收到 owner 回复;中间 `message_map` 写入正确。
  - **Test scenario 2:** E2E 拦截:陌生人 Z 发 "usdt 搬砖" → `summary_queue` 写入 → owner 未收到 → cron 触发 → owner 收 summary。
  - **Test scenario 3:** E2E /settings:owner 发 `/settings` → 内联按钮点 +1h → `user_settings.summaryTimeHour` 调整;下次 cron 计算使用新值。
- **Verification:** `pnpm test:integration` 全绿;`wrangler deploy` 成功;按 `docs/setup.md` 步骤可重放完整部署。

---

## Verification Contract

| 阶段 | 命令 / 行为 | 适用 unit |
|---|---|---|
| 本地 dev | `wrangler dev` | 每次改 Worker 代码 |
| 单元测试 | `pnpm test` 或 `npm test` | U1-U8 |
| 集成测试 | `pnpm test:integration` (miniflare + 模拟 TG) | U9 端到端 + U6/U7/U8 端到端 |
| 类型检查 | `pnpm tsc --noEmit` | 每次提交 |
| Deploy | `wrangler deploy` | 跨 unit 集成发布 |
| 真实 smoke | `wrangler tail` + 真实 TG 对话 | 部署后验证 |
| Cron 本地 | `wrangler scheduled` 或集成测试 mock | U8 |
| KV 配额 | CF Dashboard → KV → Metrics,写 ≤ 1,000/天、list ≤ 1,000/天、读 ≤ 10 万/天 | 全程 |

**Failure signals:**
- 单元测试红色、集成测试红色、TS 类型错误、wrangler deploy 报错、wrangler dev 启动报 TLS/secret 错、真实 TG smoke 中 reply 无响应、Cron 摘要时间错位或完全未达 owner。
- 任一信号触发 → 回到对应 unit 重跑 / 重写,直到全绿。

---

## Definition of Done

**Global Done Criteria:**

1. U1-U9 全部完成,每个 unit 的 Verification 通过。
2. `pnpm test` 与 `pnpm test:integration` 全绿。
3. README 与 `docs/setup.md` 含完整部署步骤,且能按其成功 deploy + 启动。
4. BotFather Bot 已创建,Webhook URL 与 secret 已 `setwebhook` 设置,owner `/start` 后 Bot 自动绑定 `bot:owner_chat_id`。
5. 真实 TG 烟雾测试通过:陌生人点按钮 → Bot 转发 → owner reply → 陌生人收到。
6. 拦截演示通过:陌生人发 "usdt 搬砖日入过千 https://..." → 静默拦截 → cron at user TZ 22:00 → owner 收"今日拦截 1 条"。
7. 无 token 落地在仓库或 commit 历史(`grep -r "BOT_TOKEN=" .` 应为空,`.dev.vars` gitignored)。
8. CF Workers dashboard 显示运行未触发 quota 报警(Commands / Requests / KV / Cron Triggers 全部在 free tier 内)。
9. `wrangler tail` 24 小时无未捕获异常。

**Per-Unit DoD** 见各 Implementation Unit 的 **Verification** 字段。

**Cleanup criterion:** 长跑大改或 dead-end 实验代码、调试用的 `console.log` 与之相关的 import、未在测试中使用的工具函数、TODO 注释,均须在最终 commit 前清理;无 orphaned `imports`、死 toggle、未关联的 help 字段。
