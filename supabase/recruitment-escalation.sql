-- =============================================================================
-- RCT MP · 招募通知按部门 + 24 小时逐级升级提醒
-- 前置：recruitment-trainee.sql
-- -----------------------------------------------------------------------------
-- 1. 新申请只通知「该职位所属部门」的经理（无匹配时回退高级管理层）
-- 2. 记录 notify_stage / last_notified_at
-- 3. rct_recruitment_escalate()：
--    · 24h 未处理 → 通知高级经理（senior_* / Lv.90+）
--    · 48h 未处理 → 通知决策层（Lv.98+）
--    · 72h 后每 24h → 继续提醒决策层
-- 4. pg_cron 每小时执行 rct_recruitment_cron()（升级 + 实习到期提醒）
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =============================================================================
-- STEP 1 · 通知阶段字段
-- =============================================================================
alter table public.recruitment_applications
  add column if not exists notify_stage integer not null default 0;
alter table public.recruitment_applications
  add column if not exists last_notified_at timestamptz;

create index if not exists recruitment_applications_escalate_idx
  on public.recruitment_applications (status, notify_stage, created_at)
  where status in ('pending', 'reviewing');

-- =============================================================================
-- STEP 2 · 按部门通知（替换旧的全员通知触发器）
-- =============================================================================
create or replace function public.rct_recruitment_notify_staff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_dept text;
  v_notified integer := 0;
begin
  select department into v_dept
  from public.recruitment_positions
  where id = new.position_id;

  insert into public.notifications (user_id, actor_id, type, content, link, is_read)
  select p.id, new.user_id, 'recruitment',
         '新的招募申请：' || coalesce(nullif(new.position, ''), '未命名职位'),
         '/admin/recruitment',
         false
  from public.profiles p
  where p.id <> new.user_id
    and p.role_level >= 40
    and (
      -- 本部门经理（社区经理属于高层，但负责社区线）
      (v_dept = '社区线' and p.role in ('manager', 'community_moderation_manager', 'media_manager', 'translation_manager'))
      or (v_dept = '活动线' and p.role = 'event_manager')
      or (v_dept = '游戏管理线' and p.role = 'game_moderation_manager')
      or (v_dept = '支持线' and p.role = 'support_manager')
      or (v_dept = '开发团队' and p.role in ('web_developer', 'game_developer'))
      or (v_dept is null and p.role_level >= 70)
      or (v_dept not in ('社区线','活动线','游戏管理线','支持线','开发团队') and p.role_level >= 70)
    );

  get diagnostics v_notified = row_count;

  -- 没有对应部门经理时，回退通知 Lv.90+，避免申请无人处理
  if v_notified = 0 then
    insert into public.notifications (user_id, actor_id, type, content, link, is_read)
    select p.id, new.user_id, 'recruitment',
           '新的招募申请（暂无对应部门经理）：' || coalesce(nullif(new.position, ''), '未命名职位'),
           '/admin/recruitment',
           false
    from public.profiles p
    where p.id <> new.user_id
      and p.role_level >= 90;
  end if;

  update public.recruitment_applications
     set last_notified_at = now()
   where id = new.id;

  return new;
end
$fn$;

-- 触发器已存在（trg_recruitment_notify_staff），函数替换即可

-- =============================================================================
-- STEP 3 · 逐级升级
-- =============================================================================
create or replace function public.rct_recruitment_escalate()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_dept text;
  v_notified integer;
  v_senior_count integer := 0;
  v_top_count integer := 0;
  v_remind_count integer := 0;
begin
  for r in
    select a.id, a.user_id, a.position, a.position_id, a.created_at,
           a.notify_stage, a.last_notified_at
    from public.recruitment_applications a
    where a.status in ('pending', 'reviewing')
      and a.created_at <= now() - interval '24 hours'
  loop
    select department into v_dept
    from public.recruitment_positions
    where id = r.position_id;

    -- 24 小时未处理 → 高级经理
    if r.notify_stage = 0 then
      insert into public.notifications (user_id, actor_id, type, content, link, is_read)
      select p.id, r.user_id, 'recruitment',
             '招募申请超 24 小时未处理：' || coalesce(r.position, '') || '，请尽快安排审核',
             '/admin/recruitment',
             false
      from public.profiles p
      where p.id <> r.user_id
        and (
          (v_dept = '社区线' and p.role = 'senior_community_manager')
          or (v_dept = '活动线' and p.role = 'senior_event_manager')
          or (v_dept = '游戏管理线' and p.role = 'senior_game_moderation_manager')
          or (v_dept in ('支持线','开发团队') or v_dept is null)
        )
        and (
          p.role_level >= 90
          or p.role in ('senior_community_manager','senior_event_manager','senior_game_moderation_manager')
        );

      get diagnostics v_notified = row_count;
      if v_notified > 0 then
        v_senior_count := v_senior_count + 1;
      end if;

      update public.recruitment_applications
         set notify_stage = 1, last_notified_at = now()
       where id = r.id;

    -- 48 小时未处理 → 决策层
    elsif r.notify_stage = 1 and r.created_at <= now() - interval '48 hours' then
      insert into public.notifications (user_id, actor_id, type, content, link, is_read)
      select p.id, r.user_id, 'recruitment',
             '招募申请超 48 小时未处理：' || coalesce(r.position, '') || '，已升级至决策层',
             '/admin/recruitment',
             false
      from public.profiles p
      where p.id <> r.user_id
        and p.role_level >= 98;

      get diagnostics v_notified = row_count;
      if v_notified > 0 then
        v_top_count := v_top_count + 1;
      end if;

      update public.recruitment_applications
         set notify_stage = 2, last_notified_at = now()
       where id = r.id;

    -- 72 小时后每 24 小时继续提醒决策层
    elsif r.notify_stage = 2
          and r.created_at <= now() - interval '72 hours'
          and (r.last_notified_at is null or r.last_notified_at <= now() - interval '24 hours') then
      insert into public.notifications (user_id, actor_id, type, content, link, is_read)
      select p.id, r.user_id, 'recruitment',
             '招募申请仍未处理（已超 72 小时）：' || coalesce(r.position, '') || '，请尽快审核',
             '/admin/recruitment',
             false
      from public.profiles p
      where p.id <> r.user_id
        and p.role_level >= 98;

      get diagnostics v_notified = row_count;
      if v_notified > 0 then
        v_remind_count := v_remind_count + 1;
      end if;

      update public.recruitment_applications
         set last_notified_at = now()
       where id = r.id;
    end if;

    v_notified := 0;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'senior_escalated', v_senior_count,
    'top_escalated', v_top_count,
    'top_reminded', v_remind_count
  );
end
$fn$;

-- =============================================================================
-- STEP 4 · Cron 包装函数（升级 + 实习到期提醒）
-- =============================================================================
create or replace function public.rct_recruitment_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_escalate jsonb;
  v_trainee jsonb;
begin
  v_escalate := public.rct_recruitment_escalate();
  v_trainee := public.rct_recruitment_send_trainee_reminders();
  return jsonb_build_object('ok', true, 'escalate', v_escalate, 'trainee', v_trainee);
end
$fn$;

do $cron_grants$
begin
  execute 'revoke all on function public.rct_recruitment_escalate() from public';
  execute 'grant execute on function public.rct_recruitment_escalate() to service_role';
  execute 'revoke all on function public.rct_recruitment_cron() from public';
  execute 'grant execute on function public.rct_recruitment_cron() to service_role';
end
$cron_grants$;

-- =============================================================================
-- STEP 5 · pg_cron 每小时执行（幂等：同名 job 先删除再创建）
-- =============================================================================
do $cron_schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('rct-recruitment-hourly');
    exception when others then
      null; -- job 不存在时忽略
    end;

    perform cron.schedule(
      'rct-recruitment-hourly',
      '0 * * * *',
      'select public.rct_recruitment_cron()'
    );
    raise notice '已创建 pg_cron 任务：rct-recruitment-hourly（每小时）';
  else
    raise notice 'pg_cron 未安装，跳过数据库定时任务（可继续用 Vercel Cron）';
  end if;
end
$cron_schedule$;

commit;

-- V-ESC-1
select jobid, schedule, command, active from cron.job where jobname = 'rct-recruitment-hourly';

-- V-ESC-2
select column_name from information_schema.columns
where table_schema='public' and table_name='recruitment_applications'
  and column_name in ('notify_stage','last_notified_at');

-- 回滚
-- select cron.unschedule('rct-recruitment-hourly');
-- drop function if exists public.rct_recruitment_cron();
-- drop function if exists public.rct_recruitment_escalate();
-- （通知函数恢复旧版请重跑 recruitment-notify-staff.sql）
-- alter table public.recruitment_applications drop column if exists notify_stage, drop column if exists last_notified_at;
