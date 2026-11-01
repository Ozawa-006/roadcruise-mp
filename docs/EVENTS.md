# RCT MP · 活动系统（Events）

> 相关文件：`supabase/events.sql`（表/RLS/RPC）、`app/events/page.tsx`（列表）、`app/events/[id]/page.tsx`（详情/报名）、`app/admin/events/page.tsx`（工作人员管理）。
> 前置：已执行 `supabase/p0-hardening.sql`。

## 1. 数据模型

`events`

| 字段 | 说明 |
| --- | --- |
| `id` | bigint 主键 |
| `title` / `description` | 标题 / 描述（纯文本，前端 `whitespace-pre-wrap` 渲染） |
| `start_at` / `end_at` | 开始 / 结束时间（timestamptz） |
| `location` / `server_id` | 集合地点 / 关联服务器标识（预留对接游戏服） |
| `capacity` | 名额上限（null = 不限） |
| `image_url` | 封面图外链（沿用项目“图床外链”策略） |
| `status` | `draft` 草稿 / `published` 已发布 / `cancelled` 已取消 |
| `created_by` | 发布人 |
| `created_at` / `updated_at` | 时间戳（updated_at 由触发器维护） |

`event_registrations`

| 字段 | 说明 |
| --- | --- |
| `event_id` + `user_id` | 唯一约束（一个用户对一个活动只有一条记录） |
| `status` | `registered` 已报名 / `cancelled` 已取消 |
| `note` | 报名备注（可选） |

公开报名人数用视图 `event_registration_counts`（`security_invoker=false` + 只暴露 event_id/count），匿名可读，不暴露报名者身份。

## 2. RLS / 权限

| 操作 | 谁 | 方式 |
| --- | --- | --- |
| 读已发布活动 | 匿名 + 登录 | `events_select_published_or_staff` |
| 读草稿/取消活动、增删改活动 | Lv.40+ | `events_*_staff` |
| 读报名记录 | 本人 / Lv.40+ | `event_registrations_select_own_or_staff` |
| 报名 / 取消 | 本人（需 Steam 验证） | RPC `rct_event_register` / `rct_event_cancel` |
| 公开人数 | 匿名 | `event_registration_counts` 视图 |

> 直接 `insert event_registrations` 也带 RLS 校验，但名额/时间/重复报名由 RPC 统一处理，前端应只调 RPC。

## 3. RPC

```text
rct_event_register(p_event_id bigint, p_note text)  -- 报名（校验：已发布、未开始、已验证、未重复、名额）
rct_event_cancel(p_event_id bigint)                 -- 取消报名
```

失败时 `error.message` 为中文原因，例如：`未完成 Steam 正版验证，不能报名活动`、`活动名额已满`、`该活动已开始，无法报名`、`你已报名该活动`。

## 4. 页面

- `/events`：已发布活动列表，分“即将开始 / 已结束”，展示报名人数/容量、地点/服务器，点击进详情；工作人员显示「活动管理」入口。
- `/events/[id]`：活动详情 + 报名/取消报名（备注可选）；名额满/已开始/未验证会给明确提示。
- `/admin/events`：Lv.40+ 可新建/编辑/发布/取消/删除活动（`status` 控制可见性）。
- 首页「VTC Events」区块展示最近 3 个即将开始的活动；数据统计里的「发布的活动」为已发布活动数。
- 导航栏「活动」下拉 → 活动列表（Lv.40+ 额外显示“创建活动”）。

## 5. 已知限制 / 后续

- 暂无「候补/等待名单」，名额满即拒绝；如需可加 `waitlist` 状态。
- 暂无周期活动、活动提醒推送（通知表可用，但未接）。
- `server_id` 目前只是文本展示，等游戏服 API 上线后可联动 `/servers` 页面与启动器深链。
- 活动封面依赖外链图床，免费图床失效会导致图片丢失（与发帖配图同一策略）。
- 删除活动会级联删除报名记录（`on delete cascade`）。

## 6. 上线/回滚

- 执行：`supabase/events.sql`（先 `rollback;` 预演，再 `commit;`）。
- 校验：文件末尾 V-EV-1 ~ V-EV-5。
- 回滚：文件末尾有 `drop view/function/table` 与 custom_id 约束/索引的删除语句；数据不会自动恢复，需按备份处理。
