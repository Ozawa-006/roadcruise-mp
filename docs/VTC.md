# RCT MP · VTC 车队系统（进阶管理）

> 相关文件：`supabase/vtc-advanced.sql`（数据库/RPC）、`app/vtc/page.tsx`（大厅）、`app/vtc/[id]/page.tsx`（详情与管理）、`app/vtc/create/page.tsx`（创建）。
> 前置：先执行 `supabase/p0-hardening.sql`（RLS/守卫触发器），再执行 `supabase/vtc-advanced.sql`。

## 1. 数据模型

成员关系仍是 `profiles.vtc_id` + `profiles.vtc_role`（不新建 `vtc_members`，避免全站重构）：

| 字段 | 说明 |
| --- | --- |
| `profiles.vtc_id` | 所属车队（null = 无车队） |
| `profiles.vtc_role` | 职位：`owner` 队长 / `vice_owner` 副队长 / `dispatcher` 调度员 / `member` 车手 |
| `vtcs.owner_id` | 车队所有者（与 `profiles.vtc_role='owner'` 必须一致） |
| `vtcs.join_mode` | 加入方式：`open` 开放加入 / `approval` 申请审批（默认）/ `invite` 仅邀请 |
| `vtcs.is_recruiting` | 是否开放招募（关闭后申请/直接加入都会被拒绝，邀请仍可） |

新表：

| 表 | 用途 | 状态 |
| --- | --- | --- |
| `vtc_applications` | 入队申请（留言、审核人、审核时间） | pending / approved / rejected / cancelled |
| `vtc_invitations` | 邀请（邀请人、响应时间） | pending / accepted / declined / cancelled |

约束：
- 一个用户全局只能有一条 `pending` 申请（部分唯一索引）。
- 同一车队对同一用户只能有一条 `pending` 邀请（部分唯一索引）。
- 申请/邀请表 **只有 SELECT 策略**（本人 / 该车队管理层 / Lv.40+），写操作必须走 RPC。

## 2. 权限矩阵

| 操作 | 谁能做 | RPC |
| --- | --- | --- |
| 申请加入（approval） | 已 Steam 验证、当前无车队的登录用户 | `rct_vtc_apply` |
| 取消自己的申请 | 申请人 | `rct_vtc_cancel_application` |
| 直接加入（open） | 已 Steam 验证、当前无车队 | `rct_vtc_join_open` |
| 审核申请 | 队长 / 副队长 | `rct_vtc_review_application` |
| 邀请成员 | 队长 / 副队长 | `rct_vtc_invite` |
| 接受/拒绝邀请 | 被邀请人 | `rct_vtc_respond_invite` |
| 退出车队 | 成员（队长不可，需先转让/解散） | `rct_vtc_leave` |
| 踢人 | 队长 / 副队长（不能踢队长/自己） | `rct_vtc_kick` |
| 设置职位 | **仅队长**（可设副队长/调度员/车手） | `rct_vtc_set_role` |
| 转让车队 | **仅队长**（新队长必须是本队成员） | `rct_vtc_transfer` |
| 解散车队 | **仅队长**（需传 `DISSOLVE` 确认） | `rct_vtc_dissolve` |
| 修改车队信息/加入方式/招募开关 | 队长（RLS `vtcs_update_owner` 直接更新） | — |

## 3. RPC 契约

所有 RPC 均为 `SECURITY DEFINER` + `set search_path = public, pg_temp`，返回 `jsonb`（成功 `{ok:true}`），失败抛异常（PostgREST 会把中文原因放进 `error.message`）。仅授予 `authenticated` / `service_role`。

```text
rct_vtc_apply(p_vtc_id bigint, p_message text default null)
rct_vtc_cancel_application(p_id bigint)
rct_vtc_review_application(p_id bigint, p_approve boolean)
rct_vtc_join_open(p_vtc_id bigint)
rct_vtc_leave()
rct_vtc_invite(p_user_id uuid)
rct_vtc_respond_invite(p_id bigint, p_accept boolean)
rct_vtc_kick(p_user_id uuid)
rct_vtc_set_role(p_user_id uuid, p_role text)   -- vice_owner / dispatcher / member
rct_vtc_transfer(p_new_owner uuid)
rct_vtc_dissolve(p_confirm text)                -- 必须是 'DISSOLVE'
```

前端调用示例：

```ts
const { error } = await supabase.rpc('rct_vtc_apply', {
  p_vtc_id: vtcId,
  p_message: message,
});
if (error) setMsg(error.message || '操作失败，请稍后重试');
```

## 4. 跨用户写入是怎么放行的

`profiles` 的 UPDATE 策略只允许“本人或 Lv.70+”，普通队长（Lv.10）无法直接改队员的 `vtc_id/vtc_role`。因此：

1. RPC 校验调用者身份（队长/副队长/本人等）；
2. 在事务内执行 `set_config('rct.vtc_admin','on',true)`；
3. `rct_guard_profiles` 守卫触发器识别到该 GUC 后放行车队字段变更（其它身份字段保护仍然生效）；
4. RPC 结束时重置为 `off`（事务级，不会泄漏到后续请求）。

普通客户端无法在同一个 PostgREST 请求里设置该 GUC（`set_config` 在 `pg_catalog`，不会被暴露为 RPC），所以不能借此绕过守卫。

## 5. 通知

RPC 会自动写 `notifications`（`type='vtc'`），导航栏铃铛可见：

- 有新申请 → 通知队长
- 申请通过/拒绝 → 通知申请人
- 被邀请 → 通知被邀请人；对方接受 → 通知邀请人
- 被踢 → 通知被踢者
- 成为新队长 → 通知新队长
- 车队被解散 → 通知所有成员（link 为空，因为车队页已删除）

## 6. 页面行为

- `/vtc` 大厅：卡片显示加入方式徽章与招募状态；按 `join_mode` 显示「立即加入 / 申请加入 / 仅邀请」；已申请显示“审核中”并可取消；收到邀请显示“接受/拒绝”。
- `/vtc/[id]`：
  - 管理层：申请审核区、邀请成员（搜索昵称/ID）；
  - 队长：成员管理（设职位、踢人）、车队设置（加入方式、招募开关）、危险区（转让、解散）；
  - 非成员：按加入方式操作；
  - 成员：退出车队。
- `/vtc/create`：创建时选择加入方式（默认申请审批）。

## 7. 已知限制 / 后续

- 转让/解散没有二次密码校验（只有前端 confirm / `DISSOLVE` 字符串），后续可加审计日志。
- 邀请只支持站内已有账号（不能邀请邮箱）。
- 通知没有实时推送（仍是轮询/刷新时读取）。
- 车队专属新闻页、活动系统尚未实现（见根目录交接文档 TODO）。
- 建议后续把 `vtcs` 的编辑也收进 RPC，统一审计。

## 8. 上线/回滚

- 执行：`supabase/vtc-advanced.sql`（先 `rollback;` 预演）。
- 校验：文件末尾 V-VTC-1 ~ V-VTC-4。
- 回滚：文件末尾有逐条 `drop function/table/column` 清单；守卫触发器用 `p0-hardening.sql` 里的版本重新覆盖即可。
- 数据变更（`join_mode` 默认值、历史车队改审批制）不会自动回滚，需按备份恢复。
