# RCT MP 安全说明（数据库 / 鉴权 / 上线流程）

| 项目 | 值 |
| --- | --- |
| 站点 | <https://www.roadcruise-mp.com> |
| Supabase project ref | `undmtiotuffrqcfvqand` |
| 技术栈 | Next.js 16 App Router + Supabase Postgres/Auth/Storage |
| 本文档状态 | 交接文档；对应代码改动已在工作区落地，**数据库脚本尚未执行** |
| 配套文件 | [`supabase/inspect-schema.sql`](../supabase/inspect-schema.sql)、[`supabase/p0-hardening.sql`](../supabase/p0-hardening.sql)、[`.env.example`](../.env.example) |

> **一句话结论**：在 `supabase/p0-hardening.sql` 被执行之前，`NEXT_PUBLIC_SUPABASE_ANON_KEY` 等价于数据库的匿名读写通行证；Steam 验证曾经可以被绕过；后台判权曾经只发生在浏览器里。代码侧已修（OpenID 验签 + 签名 Cookie + service_role 写库），**数据库侧必须由项目所有者手动执行加固脚本后才算闭环**。

---

## 0. 一页速览

| 能力 | 加固前 | 加固后（目标） | 代码状态 | 数据库状态 |
| --- | --- | --- | --- | --- |
| Steam 验证 | 直接信任 URL 里的 `openid.claimed_id`，可伪造 | 回 Steam `check_authentication` 验签 + 游戏库/时长复核 | ✅ 已实现 | — |
| 验证结果传递 | `?steamid=..&verified=true` 明文 URL 参数 | HMAC-SHA256 签名的 HttpOnly Cookie | ✅ 已实现 | — |
| 绑定落库 | 前端带 `userId` 参数 → service_role 直写（IDOR） | 服务端校验 Bearer token 拿 uid，`userId` 不再来自 URL | ✅ 已实现 | — |
| 判权依据 | 旧代码里的硬编码邮箱白名单（已删除）+ 各处重复权重表 | 只依据 `profiles.role_level`（`lib/permissions.ts` 唯一事实来源） | ✅ 已实现 | ✅ 触发器兜底 |
| 数据库权限 | 无 RLS / 策略未知 | RLS + 28 条策略 + 3 个守卫触发器 | — | ⏳ **待执行** |
| 计数一致性 | 前端 `update(replies_count + 1)`，可伪造/竞态 | 数据库触发器维护 + 客户端写被忽略 | ✅ 代码兼容 | ⏳ **待执行** |
| 通知 | 表 0 行，无写入方 | 回复触发器自动插入 | ✅ 前端未接 | ⏳ **待执行** |

---

## 1. 当前风险（按严重度）

### P0-1 · Steam 验证可绕过（已修代码，待部署）

**旧实现**：`app/api/auth/steam/callback/route.ts` 只做 `claimedId.split('/').pop()`，**从不回 Steam 验签**。任何人手搓一个 URL：

```
/api/auth/steam/callback?source=settings&userId=<受害者uuid>&openid.claimed_id=https://steamcommunity.com/openid/id/7656119XXXXXXXXXX
```

就能把任意 SteamID 写进任意账号（`userId` 还直接来自 query）。同时注册链路把 `steam_id` / `steam_verified` 塞进 `signUp({ options: { data } })` 的 metadata —— metadata 是客户端可控的，等于"自己宣布已通过验证"。

**影响**：冒充任意 Steam 身份、绕过"必须拥有正版 ETS2"的准入门槛、污染 `steam_verified`（发帖权限的前置条件）。

**现状**：`lib/steam.ts#verifyOpenIdAssertion` 已改为把断言原样 POST 回 Steam 的 `check_authentication`，并校验 `is_valid:true`、`openid.op_endpoint` 前缀、`claimed_id` 前缀、SteamID64 必须 17 位。见 [`lib/steam.ts`](../lib/steam.ts)。`signUp` 现在只传 `display_name`。

### P0-2 · 绑定接口 IDOR（已修代码，待部署）

**旧实现**：`/api/auth/steam/verify?source=settings&userId=<任意>` → 回调里用 `service_role` 把该 `userId` 的 `steam_id/steam_verified` 改掉。攻击者不需要受害者的 cookie，只要诱导受害者点一次链接，或自己构造 userId。

**现状**：`source=settings` 必须先带 `Authorization: Bearer <supabase access token>`，服务端用 `auth.getUser(token)` 换出 uid，再写进签名的 `rct_steam_state` Cookie；回调只信这个 Cookie（`state.nonce` 还要与 URL 匹配）。见 [`app/api/auth/steam/verify/route.ts`](../app/api/auth/steam/verify/route.ts)。

### P0-3 · 服务端无鉴权、判权在浏览器（已修代码）

旧的 `/admin/*` 页面全部是 `'use client'` + `supabase.from('profiles').select('role')` 后 `alert()` 跳转，并且用硬编码邮箱做超管后门。绕过方式：直接调 PostgREST（anon key 就在浏览器里），或改 `profiles.role_level` 自己升级。

**现状**：硬编码邮箱已移除；所有页面统一 `import { levelOf, canAccessAdmin, ... } from '@/lib/permissions'`。但请注意：**前端判权只负责体验，真正的权限边界是 RLS**。前端改完不等于安全 —— 这正是要跑 `p0-hardening.sql` 的原因。

### P0-4 · 数据库没有 RLS / 策略未知（待核对 + 待执行）

仓库里此前**没有任何建表 / RLS / 触发器 SQL**，所以线上权限状态只能靠实测推断：

- `roles` 对匿名返回 **401** → 说明该表 `relrowsecurity` 已是 `ON`，但**缺 select 策略**（PostgREST 对"RLS 拒绝"返回 401）。
- 其余表匿名可读 → 说明**要么 RLS 关闭，要么策略是 `using (true)`**。
- `profiles` 能被任意登录用户 `update` 自己的 `role_level` —— 这一点由旧前端代码可以推断（`app/admin/users/page.tsx` 直接 `.update({ role, role_level })` 且能成功），佐证 RLS 未收紧。

> ⚠️ **RLS 的确切状态以 `supabase/inspect-schema.sql` 的输出为准**，本文档不臆断。

### P0-5 · service_role 密钥的暴露面

`SUPABASE_SERVICE_ROLE_KEY` 目前只出现在 `app/api/auth/steam/*` 的 Route Handler 与 [`lib/supabase-server.ts`](../lib/supabase-server.ts) 中，属于正确用法。需要持续保证：

- 不加 `NEXT_PUBLIC_` 前缀；不在 `'use client'` 文件里 import `lib/supabase-server.ts`；
- 不把 Supabase 的原始错误对象直接返回给浏览器（可能带表名/策略名）；
- 构建后用 `Select-String -Path .next\static\**\*.js -Pattern "service_role"` 扫一遍产物。

### P0-6 · `replies_count` 由客户端自增

`app/forum/[id]/[topicId]/page.tsx` 在插入回复后执行 `update({ replies_count: 当前值 + 1 })`。任何用户都能把自己的帖子改成 `replies_count = 999999`，并发回复还会丢计数。**修复方式**：数据库触发器维护 + 守卫触发器忽略客户端写入（脚本 STEP 5/6），前端无需改动（写入会被静默忽略，不会报错）。

### P1-1 · 匿名可读 `profiles` 暴露 `steam_id` / `discord_id`

现状（也是加固后刻意保留的行为）是"公开资料匿名可读"。风险：`steam_id` 可被用来查 Steam 主页、`discord_id` 可被用来精准社工。**P0 阶段不动它**（`app/settings/page.tsx` 用了 `select('*')`，列级收权会直接打断页面），列入 P2：改为列级 `GRANT SELECT (col...)` + 前端只取需要的列。

### P1-2 · 无速率限制、无审计日志

注册、发帖、回帖、Steam 回调都没有限流；`/api/auth/steam/*` 每次都打 Steam API（有被刷爆配额的风险）。数据库侧也没有 `audit_log` 表，出事后无法回溯"谁把谁的 role_level 改成了 100"。

### P1-3 · `custom_id`（靓号）没有唯一约束

后台允许工作人员/开发者改自己的 `custom_id`（`app/admin/users/page.tsx` 的 `isSelf` 分支只提交 `custom_id`），但没有唯一索引 → 两个人可以抢同一个靓号，进而用于冒充。

---

## 2. 新的鉴权设计

### 2.1 三道防线

```
① 真实性：Steam OpenID 2.0 断言 → POST check_authentication → is_valid:true
② 载体  ：base64url(payload) + "." + base64url(HMAC-SHA256(payload, AUTH_SECRET))
          写入 HttpOnly + SameSite=Lax + Secure(生产) 的 Cookie，10 分钟过期
③ 落库  ：服务端用 Authorization: Bearer <supabase access token> 换出 uid，
          再用 service_role 写 profiles，客户端永远没有写 steam_* 的权限
```

### 2.2 两个流程

**注册（register）**

1. `/login` 点击"通过 Steam 验证" → `/api/auth/steam/verify?source=register`
2. 服务端生成 `nonce`，把 `{source, nonce, exp}` 签名后写 `rct_steam_state`，302 到 Steam
3. Steam 回跳 `/api/auth/steam/callback?nonce=...`：校验 state Cookie 与 nonce → 验签断言 → 查游戏库（ETS2 + ≥120 分钟）
4. 通过 → 下发 `rct_steam_pending`（内含已验证的 `steamid`，10 分钟）→ 跳 `/login?steam_verified=1`
5. `/login` 调 `/api/auth/steam/pending` 判断"当前浏览器是否真的验证过"（**不读 URL 参数**）→ 展示注册表单
6. `signUp({ email, password, data: { display_name } })` —— metadata 里**不再有** `steam_id/steam_verified`
7. 用户点邮件确认 → 登录 → 前端自动 `POST /api/auth/steam/bind`（带 Bearer）
8. `/bind`：验 token → 验 `rct_steam_pending` → 再用 Steam API 复核一遍 → 查重（该 SteamID 是否已被别人绑定）→ `service_role` 写 `steam_id` + `steam_verified=true` → 清 Cookie

**已登录绑定（settings）**

1. `/settings` 点"前往验证" → `GET /api/auth/steam/verify?source=settings`（带 Bearer）→ 返回 `{redirectUrl}`，服务端已把 uid 写进签名 state
2. 回跳 `/api/auth/steam/callback`：同上验签 → 查重 → `service_role` 写库

### 2.3 关键实现

| 文件 | 职责 | 不能做什么 |
| --- | --- | --- |
| [`lib/steam.ts`](../lib/steam.ts) | OpenID 验签、`GetOwnedGames` 查询、SteamID64 校验 | 不能引入到客户端（会带 `STEAM_API_KEY`） |
| [`lib/steam-token.ts`](../lib/steam-token.ts) | HMAC 签名/验签、Cookie 选项、SteamID 打码 | 不能把 `AUTH_SECRET` 传给浏览器 |
| [`lib/supabase-server.ts`](../lib/supabase-server.ts) | anon client（验 token）+ admin client（service_role 写库） | admin client 只能出现在 Route Handler |
| `app/api/auth/steam/{verify,callback,pending,bind}/route.ts` | 四个端点，`runtime = 'nodejs'`、`dynamic = 'force-dynamic'` | 不信任任何 URL 里的身份参数 |
| [`lib/permissions.ts`](../lib/permissions.ts) | `ROLE_LEVEL` 阈值 + `levelOf()` 归一化 | 不再有任何邮箱白名单 |

**为什么用 HttpOnly Cookie 而不是 URL 参数**：URL 会进浏览器历史、Referer、日志、代理；而且 URL 参数天然可编辑。签名 Cookie 客户端读不到、改不了（改了签名就对不上，`timingSafeEqual` 会拒绝）。

**为什么还要服务端复核**：Cookie 可能被用户"保存下来"跨设备重放（虽然 10 分钟过期）。`/bind` 里再查一次 Steam 游戏库，保证"绑定那一刻仍然满足门槛"，同时间接防御 Cookie 泄露。

**为什么 `check_authentication` 是必须的**：Steam 的 `claimed_id` 就是一段可读文本，任何人都能拼。只有把完整断言（含 `openid.sig` / `openid.signed`）回传 Steam，让 Steam 用它自己的私钥验证签名，才能确认"这条断言真的来自 Steam"。

### 2.4 权限模型（唯一事实来源）

| 等级 | 常量 | 能做什么 |
| --- | --- | --- |
| 100 | `ROLE_LEVEL.DEVELOPER` | 除"改自己"以外全部；可管理其他开发者（交接文档「无视任何限制」） |
| 90 | `SENIOR_MANAGER` | 编辑社区规则（`rules_articles`）、看草稿 |
| 70 | `MANAGER` | 人员管理、改他人身份字段（role/role_level/custom_id）、删任意帖/回复、官方公告版块发帖 |
| 40 | `STAFF` | 后台入口、发布新闻（数据库侧 `announcements`，仅此一项，不含改他人身份） |
| 10 | `MEMBER` | 发帖/回帖/建车队/改自己资料 |

判权规则统一为：`levelOf(profiles.role_level) >= 阈值`。`levelOf()` 会把 `null`/`NaN`/负数归零、把 >100 截到 100 —— 数据库侧 `public.rct_role_level()` 做同样的 `coalesce(..., 0)`。

**数据库侧的"防内鬼"规则**（脚本 STEP 3，比交接文档更严一点，都有注释说明）：

1. `steam_id` / `steam_verified` **只有 service_role 能写**，连 Lv.40+ 工作人员也不能代签 —— 它是"正版 ETS2 + 2 小时"门槛的唯一凭证，只能由 `/api/auth/steam/bind` 写入。
2. 不能改自己的 `role` / `role_level` / `random_id` / `discord_id`（只能改自己的 `custom_id`，对应后台"我的靓号"）。
3. 不能授予"同级或更高"的等级和职位（Lv.100 开发者豁免，允许把别人提到 100）。
4. **跨用户编辑的整行闸门**：非本人时，目标 `role_level >= 自己` 一律拒绝（含改昵称这类展示字段）；**Lv.100 开发者豁免**（可管理其他开发者，与前端 UI 一致）。
5. 更新策略允许 `Lv.70+` 修改他人行（`/admin/users` 的人员管理依赖它），但"能改哪些字段"由上面的触发器和 RLS 共同决定 —— 只给策略不给触发器，等于把提权口子留着。
6. **INSERT 守卫对任何来源都强制安全默认值**：注册（包括直接调 `POST /auth/v1/signup` 并在 metadata 里写 `role_level:100`）一律落成 `member / Lv.10 / 未验证`，与线上 `handle_new_user` 的定义无关。

---

## 3. 环境变量（6 个核心 + 1 组预留）

| 变量 | 归属 | 作用 | 泄露后果 | 获取位置 |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 浏览器 | PostgREST/Auth/Storage 入口 | 无（本就是公开信息） | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器 | 匿名 key，配合用户 JWT | **在 RLS 加固前 ≈ 全库读写**；加固后受策略约束 | Supabase → Settings → API → anon/publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端 | 绕过 RLS 写 `steam_*`；绑定流程专用 | **可读写全库、可删数据**，RLS 完全失效 | Supabase → Settings → API → service_role |
| `STEAM_API_KEY` | 仅服务端 | 查 `GetOwnedGames` 校验 ETS2 与时长 | 可被刷爆配额、可查他人游戏库 | <https://steamcommunity.com/dev/apikey> |
| `AUTH_SECRET` | 仅服务端 | HMAC-SHA256 签名 Steam 验证 Cookie | 可伪造"已验证"Cookie → 绕过 Steam 验证 | 自己生成，见下 |
| `NEXTAUTH_URL` | 构建期 | 站点公开地址（预留/固定回跳基址） | 无（公开） | 自己填 |
| `RCTMP_*`（`[7]`） | 仅服务端 | 游戏服状态页代理（`/api/servers/status`），见 `docs/API-INTEGRATION.md` | 无（内网地址/API key） | 运维分配 |

`AUTH_SECRET` 生成：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

要求：≥16 字符（代码里 `< 16` 会直接抛错，Steam 验证整条链路 500），生产/预览/本地建议不同值。**轮换会让"进行中"的验证失效**（用户需重新点一次），已入库的 `steam_verified` 不受影响。

> `.gitignore` 已是 `.env*` + `!.env.example`，所以本模板可以正常提交，而 `.env.local` / `.env.production` 仍被忽略。改这条规则时注意别把取反行删掉。
>
> 上表的 `RCTMP_*` 对应已经落地的「服务器列表」功能：`lib/server-status.ts` + `app/api/servers/status/route.ts` + `app/servers`，规格见 `docs/API-INTEGRATION.md`；未配置时页面显示"未配置服务器"，不影响其它页面。

---

## 4. 部署顺序（严格按这个顺序）

> 顺序的理由：先有数据库防线，再换代码。反过来做（先部署代码、后跑 SQL）意味着"新代码已经上线，但数据库仍然允许任何人改 `role_level`"——窗口期更长。

**Step 0 · 备份（5 分钟）**
Dashboard → Database → Backups 确认有可用备份；免费版没有 PITR，建议同时 `pg_dump` 一份 schema + 关键表。

**Step 1 · 探查（10 分钟）**
在 SQL Editor 执行 [`supabase/inspect-schema.sql`](../supabase/inspect-schema.sql) 的第 1 部分，把结果存档；重点看 U1/U2/U3/U6/U8/U11/U13（见 §7）。

**Step 2 · 预演（10 分钟）**
把 [`supabase/p0-hardening.sql`](../supabase/p0-hardening.sql) 整段粘进 SQL Editor，**先把末尾的 `commit;` 改成 `rollback;`** 再执行。
- 期望：所有 step 跑完、有若干 `NOTICE`（计数器/唯一索引/策略自检）、最后整体回滚。
- 任何一步报错 → 先解决，**不要**带着报错去 commit。新的预检会主动阻断三种情况：
  1. `forum_topics.category_id` 不是 integer（官方公告版块保护会失效）；
  2. `notifications` 缺列（STEP 7/13 会条件跳过，但会在 WARNING 里提示）；
  3. STEP 14 发现"非本脚本创建的旧 RLS 策略"→ 默认直接失败回滚（防止旧 `using(true)` 与新策略取并集）。

**Step 3 · 落地（5 分钟）**
把 `rollback;` 改回 `commit;`，再执行一次。然后跑脚本末尾的 V1~V9 校验：

- V1：`profiles / roles / ... / objects` 全部 `rls_enabled = true`
- V3：28 条策略全部 `OK`，没有 `MISSING`
- V5：`rct_role_level` / `rct_is_steam_verified` 是 `security_definer=true` 且 `search_path` 含 `public`；`rct_caller_is_backend` 是 INVOKER（false 正常）
- V8：`replies_count` 与真实回复数的差异（历史数据可能早就对不上，需要时执行 V8.1 一次性校正）
- V9：角色等级体检 —— 确认 5 个标准等级，且没有 `role_level=60/80` 的历史账号（STEP 4.1 已把 roles 字典归一化，并把 60→70、80→90、`role='developer'` 的等级按白名单逻辑处理；STEP 0.6 已撤销不可证明的 `steam_verified`）

**Step 4 · 更新 Vercel 环境变量（5 分钟）**
Vercel → Settings → Environment Variables，补齐 6 个变量（重点是新增的 `AUTH_SECRET`），Production 与 Preview 都要。
注意：改完环境变量**必须 Redeploy** 才生效。

**Step 5 · 部署代码 + 冒烟（10 分钟）**
正常部署，然后按 §5 的清单逐项验收。**建议 SQL 与代码部署放在同一个低峰时段连续完成**，把"老代码 + 新策略"的窗口压到最短。

**Step 6 · 数据清理（多数已由脚本自动完成）**
- **旧验证绕过产物**：脚本 STEP 0.6 已把"`steam_verified=true` 但 `steam_id` 非法"的账号自动打回 `false`（会打 NOTICE）。被影响的账号需本人到「账号设置 → 绑定 Steam」重新验证。
- 若想保留某个账号的验证状态：执行前先给它补上正确的 17 位 `steam_id`。
- 历史 `replies_count`：按 V8/V8.1 校正。
- `profiles.steam_id` 若存在重复（inspect U11），先清理，再手工补建部分唯一索引 `profiles_steam_id_unique`（脚本会因重复而跳过并 WARNING）。
- 若 inspect 显示 `handle_new_user` 仍在信任 metadata 的 `steam_id/steam_verified`：**已由脚本 STEP 3.5 的 BEFORE INSERT 守卫兜底**（任何 INSERT 一律强制 `steam_verified=false / steam_id=null`，与触发器定义无关）。仍建议按附录 A2 改写它，把 display_name 之外的元数据（role/role_level 等）也彻底忽略。

---

## 5. 上线前测试清单

每条都用**普通浏览器 + 无痕窗口**（匿名）+ 一个专用测试账号验证。数据库侧的"应失败"要确认**是数据库拒绝**（`new row violates row-level security policy` / `权限不足`），而不是前端按钮消失。

### 5.1 匿名（无痕窗口，不登录）

| # | 操作 | 期望 |
| --- | --- | --- |
| 1 | 打开 `/`、`/forum`、`/forum/2`、`/vtc`、`/rules`、`/news/1` | 全部正常渲染，无 401 |
| 2 | 打开 `/rules` | 只看到 `status = 'published'` 的条款，草稿不可见 |
| 3 | 用 anon key 直接 `PATCH /rest/v1/profiles?id=eq.<任意>` | 401/403 或 0 行受影响 |
| 4 | 用 anon key 直接 `POST /rest/v1/announcements` | 401/403 |
| 5 | 用 anon key 直接 `GET /rest/v1/notifications` | `[]` 或 401（绝不能返回别人的通知） |

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X PATCH "https://undmtiotuffrqcfvqand.supabase.co/rest/v1/profiles?id=eq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"role_level":100}'
# 期望 401 / 403
```

### 5.2 普通用户（Lv.10，未绑定 Steam）

| # | 操作 | 期望 |
| --- | --- | --- |
| 6 | 发帖（`/forum/2/new`） | 失败，提示 RLS 拒绝（因为 `steam_verified = false`） |
| 7 | 回帖 | 同上 |
| 8 | 改自己资料（昵称/简介/头像/社交链接） | 成功 |
| 9 | 改自己 `role_level`（DevTools console 里直接 `.update`） | 失败：`禁止修改自己的 role / role_level ...` |
| 10 | 建车队（先完成 Steam 验证） | 成功，`vtcs.owner_id = 自己`，`profiles.vtc_role = 'owner'` |

### 5.3 已验证用户（Lv.10）

| # | 操作 | 期望 |
| --- | --- | --- |
| 11 | 完成 Steam 验证全链路 | 成功后 `profiles.steam_id` 为 17 位、`steam_verified = true`；Cookie `rct_steam_pending` 被清除 |
| 12 | 重新绑定另一个 Steam 账号 | 失败 409（`该账号已绑定其它 Steam 账号`） |
| 13 | 抢绑别人的 SteamID | 失败 409（`该 Steam 账号已被其它社区账号绑定`） |
| 14 | 发帖（`/forum/2/new`） | 成功 |
| 15 | 发帖到 `category_id = 1`（官方公告版块） | 失败（需要 Lv.70） |
| 16 | 回帖 | 成功；`forum_topics.replies_count` 自动 +1；楼主收到一条 `notifications` |
| 17 | 删除自己的回复 | 成功；`replies_count` -1（不会变负数） |
| 18 | 删别人的帖子 | 失败（非作者且 < Lv.70） |
| 19 | 手动 `update forum_topics set replies_count = 9999` | 请求可能 200，但值不变（被守卫触发器忽略） |
| 20 | 加入不存在的车队（`profiles.update({ vtc_id: 随机uuid })`） | 失败：`目标车队不存在` |
| 21 | 把自己写成某个车队的 owner（伪造 `vtc_role: 'owner'`） | 失败：`禁止把自己写成车队 owner` |
| 22 | 上传头像 | 成功（路径必须形如 `avatar-<自己的uid>-xxx.png`） |
| 23 | 覆盖别人路径的头像（`avatar-<别人uid>-x.png`） | 失败（Storage 策略拒绝） |

### 5.4 工作人员 / 经理 / 开发者

| # | 操作 | 期望 |
| --- | --- | --- |
| 24 | Lv.40 访问 `/admin` | 可进入；看不到"人员管理"（需 70）与"规则编辑"（需 90） |
| 25 | Lv.40 发布新闻（`/admin/news`） | 成功（交接文档：Lv.40 工作人员可发新闻；`canManageAnnouncements()` 与 SQL 均为 Lv.40） |
| 26 | Lv.70 把某 Lv.10 改成 `staff`(40) | 成功 |
| 27 | Lv.70 把某 Lv.10 改成 `manager`(70，与自己同级) | 失败：`禁止赋予同级或更高的等级` |
| 28 | Lv.70 修改另一个 Lv.70 | 失败：`禁止修改同级或上级` |
| 29 | Lv.70 修改自己（只提交 `custom_id`） | 成功（产品允许改自己的靓号） |
| 30 | Lv.90 编辑/新增/删除规则 | 成功；起草的草稿匿名不可见 |
| 31 | Lv.90 降级另一位开发者 | 失败（同级保护）→ 需 SQL Editor / service_role |
| 32 | Lv.100 把某人提到 100 | 成功（开发者豁免"不得授予同级"） |
| 32b | 任意工作人员在控制台/DevTools 里给某人 `steam_verified: true` | 失败：`steam_id / steam_verified 只能由服务端 Steam 绑定接口（service_role）写入` |

### 5.5 通知 / 计数 / 回归

| # | 操作 | 期望 |
| --- | --- | --- |
| 33 | A 发帖，B 回复，A 登录看通知 | 能看到 1 条，`link = /forum/<category_id>/<topic_id>`，`user_id = A`、`actor_id = B` |
| 34 | A 自己回复自己的帖子 | 不产生通知 |
| 35 | B 用 anon/自己身份 `select * from notifications` | 只能看到自己的（`user_id = auth.uid()`） |
| 36 | B 把通知 `is_read` 改成 true | 成功；改 `content` 无效（被钉死） |
| 37 | 首页/论坛/搜索/资料页 | 与加固前视觉一致（匿名读未被误伤） |
| 38 | 注册新账号（新邮箱） | 注册 → 邮件确认 → 登录 → 自动绑定成功 → 能发帖 |
| 39 | 直接 `POST /auth/v1/signup`，metadata 里写 `role:'developer', role_level:100` | 注册成功，但 `profiles.role_level` 仍是 10（INSERT 守卫强制） |
| 40 | 用旧断言 + 新 state Cookie 重放 `/api/auth/steam/callback` | 302 到 `/login?error=steam_signature_invalid`（`return_to` 不匹配） |
| 41 | 两个账号并发 bind 同一个 SteamID | 只有 1 个成功，另一个 409 `steam_in_use`（唯一索引兜底） |
| 42 | 已绑定 Steam 的账号在设置页重新验证另一个 Steam | 302 到 `/settings?error=steam_already_bound`，原绑定不变 |
| 43 | 车队 owner 先 `vtc_role='member'` 再退出 | 两次都被数据库拒绝（按 `vtcs.owner_id` 判定） |
| 44 | 未绑定 Steam 的用户加入车队 | 被数据库拒绝（需 `rct_is_steam_verified()`） |

---

## 6. 不要在生产直接跑"未经核对"的 DDL

这一点单独强调，因为数据库加固是**唯一可能一次性打挂全站**的操作：

1. **RLS 写错 = 全站 401**。策略少了 `to anon` 分支，首页立刻空白；`security definer` 忘了 `set search_path`，策略判权会在奇怪的地方失效。
2. **免费版 Supabase 没有 PITR**。`drop policy` + 错误的 `create policy` 没有"撤销"按钮，只能靠备份或手写回滚（`p0-hardening.sql` 末尾给了逐条回滚清单）。
3. **`create index` 会加 SHARE 锁**。当前表很小，几毫秒；但如果哪天论坛到了几十万行，必须在低峰期做，并考虑 `CONCURRENTLY`（注意它不能在事务块里跑）。
4. **先把 `commit;` 改成 `rollback;` 预演一遍**。这是零成本的保险：PostgreSQL 的 DDL 是事务性的，预演能完整暴露语法错误、依赖缺失、数据冲突，且不留痕迹。
5. **不要在 Dashboard 的 SQL Editor 里"边改边跑"**。要么整段事务执行，要么一条一条来；中间状态（RLS 开了但策略没建）会让线上短暂不可用。
6. **执行前把 `supabase/inspect-schema.sql` 的旧策略名对照一遍**。RLS 策略之间是"或"的关系：一条遗留的 `using (true)` 会让你新写的 27 条策略全部白费。脚本 STEP 14 会把"非本脚本创建的策略"以 `WARNING` 打出来，看到就必须处理。
7. **出事止血顺序**：先按脚本末尾 §1 删策略（恢复"拒绝"而不是"放行"），再排查；不要用 `disable row level security` 止血——那等于把库交给匿名 key。

---

## 7. 未知项 / 假设清单（必须由 inspect 输出确认）

以下是编写 SQL 时**基于推断的假设**。任何一条被 inspect 推翻，都要回来改脚本（脚本里已尽量用 `if exists` / `if not exists` / `::text` 做防御，但列名和表存在性无法在 DDL 阶段防御）。

| # | 未知项 | 我的假设 | 被推翻的后果 | 核对方式 |
| --- | --- | --- | --- | --- |
| 1 | `handle_new_user` 是否存在 / 定义 | 存在，但**不确定**是否读取 metadata 的 `steam_id/steam_verified` | 若它信任 metadata，新用户仍可自称已验证。**已兜底**：STEP 3.5 的 BEFORE INSERT 守卫对任何来源的 INSERT 都强制 `steam_verified=false / steam_id=null`；建议仍按附录 A2 改写以彻底忽略 metadata | U6 |
| 2 | 既有 policy 名称 | 未知；脚本只 drop 自己命名的那批 | 旧策略与新策略取并集 → 加固失效 | U8 + STEP 14 的 WARNING |
| 3 | `profiles` 是否有 `created_at` | **不确定**；脚本完全不使用该列 | 无影响（附录 A2 也不用） | U1 |
| 4 | `notifications` 表结构 | 存在，列为 `user_id/actor_id/content/link/is_read/created_at`，`created_at` 有默认值 | 回复触发器运行期报错（plpgsql 只在首次执行时校验列名）→ 回帖全挂 | U2 |
| 5 | `forum_topics.category_id` 类型 | 脚本**要求 integer**；uuid 会直接预检失败 | 避免"uuid 时 `='1'` 永远成立"导致官方版块保护失效 | U3（已改为阻断） |
| 6 | `forum_categories.id = 1` 是否真的存在 | 假设存在（前端硬编码 `id === '1'` 判官方公告） | 策略仍然成立，只是"官方版块"可能不是 1 | U3 |
| 7 | `vtcs.tag` 是否已有唯一约束 / 是否有重复 | 假设**没有**唯一索引，且当前无重复 | 有重复 → 建索引失败（脚本会先检查并给出可读报错）；已有约束 → 跳过 | U4 |
| 8 | Storage 桶名 | `avatars`，`public = true` | 策略白写，头像 403 | U10 |
| 9 | `rules_articles.id` 类型 / `status` 取值 | `id` 是整型（前端 `editingId: number`）；`status` ∈ `draft`/`published` | 策略里 `status = 'published'` 失效 → 匿名看到草稿或看不到任何规则 | U1 / 手工 |
| 10 | 各表 RLS 现状 | `roles` 已开（401 佐证）；其它未知 | 只是 `enable row level security` 幂等重跑，无副作用 | inspect §01 |
| 11 | 是否已存在 vtc 相关触发器 | 假设没有 | 重复计数（replies_count 翻倍 / 成员数错乱） | U9 |
| 12 | `auth.users` 触发器名 | 假设为 `on_auth_user_created`；脚本改为**按触发器函数名**（`handle_new_user`）判断，不按触发器名 | 不会重复创建触发器 | U7 |
| 13 | `anon` / `authenticated` 对表的 GRANT | 假设 Supabase 默认已授权（RLS 才是闸门） | 若被手动 REVOKE 过 → 策略建了也读不到 | inspect §09 |
| 14 | 历史 `replies_count` 是否准确 | **假设不准**（旧前端自增，有竞态/可伪造） | 触发器只保证"从现在开始"正确，历史值需 V8.1 一次性校正 | V8 |
| 15 | 是否有其它服务/脚本用 anon key 直连 | 假设只有本站前端 | 收紧后第三方集成会 401 | 自查 Vercel/CI/本地脚本 |
| 16 | 公告发布阈值 | **已统一**：交接文档 `>= 40`，`lib/permissions.ts` 的 `canManageAnnouncements()` 已改为 STAFF(40)，SQL `announcements_*_staff` 也是 40 | 无（数据库与界面一致；如要收紧为 70，改 `canManageAnnouncements` + SQL 4 处常量） | 已解决 |
| 17 | 注册后自动绑定依赖邮件确认 | 假设 Supabase 开启了 email confirm | 若关闭确认，注册即登录，`/bind` 仍然可用（流程不变） | Auth → Providers → Email |

---

## 8. 后续（P1 / P2，本阶段不做）

- **P1**：注册/发帖/回帖/Steam 回调的速率限制（Vercel Edge Middleware 或 Upstash）；`/api/auth/steam/*` 加简单的人机校验。
- **P1**：`audit_log` 表（who / what / before / after / at），由 `profiles` 守卫触发器写入，用于追溯提权与删帖。
- **P1**：`custom_id` 唯一索引 + 格式约束（`^[0-9]{4,8}$`）。
- **P2**：`profiles` 列级收权，把 `steam_id` / `discord_id` 从匿名读里摘出去（需同步改 `app/settings/page.tsx` 的 `select('*')`）。
- **P2**：Storage 桶加 `file_size_limit` 与 `allowed_mime_types`（当前只靠前端 `accept="image/*"`）。
- **P2**：通知前端（下拉面板 + 已读按钮），目前只有数据库触发器在写。
- **P2**：把 `supabase/` 纳入 supabase CLI 迁移（`supabase migration new`），让后续变更可 review、可回放。

---

## 9. 2026-11-01 安全复审后的修正（已合入代码/SQL）

第二轮独立安全审查（只读）发现的问题与处理：

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | INSERT 守卫对认证服务（`supabase_auth_admin`）放行 `role/role_level/custom_id/vtc_*`，注册 metadata 可自称 Lv.100 | 守卫改为**任何来源**都强制 `member / Lv.10 / 未验证 / 空特权字段`；提权只能走 service_role 的 UPDATE |
| 2 | STEP 4.1 会把预埋的 `role='developer'` 自动升到 100 | 删除自动升级，改为人工白名单（脚本内注释 + V9 名单） |
| 3 | STEP 14 对遗留旧策略只 WARNING 后 commit | 改为**默认 raise exception 回滚**；只有显式 `set rct.allow_legacy_policies='on'` 才放行 |
| 4 | `notifications` 缺列会让 STEP 7/13 的 DDL 直接让整个事务回滚 | STEP 7 策略/守卫、STEP 13 索引都改为条件执行，缺列只跳过并 WARNING |
| 5 | OpenID 回调不校验 `openid.return_to`，旧断言可配新 state Cookie 重放 | 回调精确比对 `openid.return_to` 与本次 nonce；`openid.signed` 必须覆盖 `claimed_id/op_endpoint/return_to/response_nonce`；拒绝重复 `openid.*` 参数 |
| 6 | settings 绑定可覆盖已绑定的 SteamID（换绑绕过） | 已绑定其它 Steam → 409 `already_verified`；`profiles.steam_id` 增加部分唯一索引，并发双绑由 DB 兜底 23505 |
| 7 | VTC owner 可"先把 vtc_role 改成 member、再退出"绕过保护 | 守卫改为按 `vtcs.owner_id` 判断真实 owner，owner 任何 vtc 字段变更都被拒 |
| 8 | 旧 `steam_verified=true` 但 `steam_id` 非法的账号仍可发帖 | `rct_is_steam_verified()` 同时要求 17 位 `steam_id`；STEP 0.6 自动撤销不可证明的验证状态 |
| 9 | 60/80 旧阈值账号会被新阈值锁在后台外 | STEP 4.1 自动映射 60→70、80→90（保留原管理权限） |
| 10 | 未验证用户可加入车队 | 加入车队（`vtc_id` 从 null 变为非 null）要求 `rct_is_steam_verified()` |
| 11 | 经理可改他人 `profiles.id`（主键） | 守卫禁止修改 `id` |
| 12 | 开发者互相管理：前端允许、数据库拒绝 | 数据库对 Lv.100 豁免同级限制（与文档"无视任何限制"一致） |
| 13 | 社交链接缺协议白名单 / `target="_blank"` 无 `rel` | 设置页保存前校验 `http(s)://`；所有外链加 `rel="noopener noreferrer"` |
| 14 | 搜索 `.or()` 拼接用户输入 | 过滤 `% _ , ( )` 后再拼接 |
| 15 | pending Cookie 10 分钟短于邮件确认 | 延长到 30 分钟；过期后可在「账号设置 → 绑定 Steam」重新验证 |
| 16 | bind 成功提示但 0 行更新（profile 缺失） | 更新后 `.select('id')` 校验行数；缺 profile 返回 `profile_missing` |
| 17 | 失败路径不清 pending，可能被另一账号复用 | `already_verified` / `steam_in_use` / `no_ets2` 失败时清除 pending |
| 18 | 旧版 `on_reply_created` 触发器与新触发器重复插入通知 | 已在 STEP 0.8 删除旧触发器与 `handle_new_reply()`；新触发器按 `notifications.type='reply'` 写入（该列 NOT NULL） |

**仍未处理（P1/P2，已知接受）**：`profiles` 匿名可读含 `steam_id/discord_id`（列级收权）、`custom_id` 唯一约束、速率限制、审计日志、CSP/安全响应头、`NEXTAUTH_URL` 未接入固定 origin、错误信息直出 DB 文案。
