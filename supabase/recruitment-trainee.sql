-- =============================================================================
-- RCT MP · 实习期管理（到期提醒）+ 申请状态通知员工 + 删回复权限
-- 前置：recruitment-permissions.sql
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =============================================================================
-- STEP 1 · 实习期字段
-- =============================================================================
alter table public.recruitment_positions
  add column if not exists trainee_days integer not null default 30;

do $trainee_days_check$
begin
  if not exists (select 1 from pg_constraint where conname = 'recruitment_positions_trainee_days_check'
                   and conrelid = 'public.recruitment_positions'::regclass) then
    alter table public.recruitment_positions
      add constraint recruitment_positions_trainee_days_check
      check (trainee_days between 1 and 365);
  end if;
end
$trainee_days_check$;

alter table public.recruitment_applications
  add column if not exists trainee_started_at timestamptz;
alter table public.recruitment_applications
  add column if not exists trainee_until timestamptz;
alter table public.recruitment_applications
  add column if not exists reminder_sent_at timestamptz;

create index if not exists recruitment_applications_trainee_due_idx
  on public.recruitment_applications (trainee_until)
  where promoted_at is null and status = 'accepted';

-- =============================================================================
-- STEP 2 · 通过申请：记录实习起止时间
-- =============================================================================
create or replace function public.rct_recruitment_accept(
  p_application_id bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_level  integer := public.rct_role_level();
  v_app    record;
  v_role   text;
  v_role_level integer;
  v_trainee_days integer;
begin
  if v_uid is null then raise exception '请先登录' using errcode = '42501'; end if;
  if v_level < 40 then raise exception '权限不足：需要 Lv.40+ 才能处理申请' using errcode = '42501'; end if;

  select a.id, a.user_id, a.status, a.position, a.position_id,
         p.assign_role, p.is_trainee, p.trainee_role, p.trainee_days
    into v_app
  from public.recruitment_applications a
  left join public.recruitment_positions p on p.id = a.position_id
  where a.id = p_application_id
  for update of a;

  if not found then raise exception '申请不存在'; end if;
  if v_app.status not in ('pending', 'reviewing') then
    raise exception '该申请已处理，不能重复通过';
  end if;

  if not public.rct_recruitment_can_approve(v_app.position_id) then
    raise exception '权限不足：只有该职位对应的部门经理及以上可以审核（社区线需社区经理及以上）'
      using errcode = '42501';
  end if;

  v_role := case when v_app.is_trainee then v_app.trainee_role else v_app.assign_role end;

  if v_role is not null and v_role <> '' then
    select level into v_role_level from public.roles where name = v_role;
    if v_role_level is null then
      raise exception '职位角色不存在：%', v_role;
    end if;

    perform set_config('rct.recruitment_admin', 'on', true);
    update public.profiles
       set role = v_role,
           role_level = v_role_level
     where id = v_app.user_id;
  end if;

  update public.recruitment_applications
     set status = 'accepted',
         handled_by = coalesce(handled_by, v_uid),
         handle_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), handle_note),
         trainee_started_at = case when v_app.is_trainee then coalesce(trainee_started_at, now()) end,
         trainee_until = case
           when v_app.is_trainee then coalesce(trainee_until, now() + make_interval(days => coalesce(v_app.trainee_days, 30)))
         end,
         reminder_sent_at = case when v_app.is_trainee then null else reminder_sent_at end
   where id = p_application_id;

  return jsonb_build_object(
    'ok', true,
    'role', v_role,
    'role_level', v_role_level,
    'trainee', coalesce(v_app.is_trainee, false),
    'trainee_until', (select trainee_until from public.recruitment_applications where id = p_application_id)
  );
end
$fn$;

-- =============================================================================
-- STEP 3 · 实习到期提醒 RPC（由每日 Cron 调用）
-- =============================================================================
create or replace function public.rct_recruitment_send_trainee_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_count integer := 0;
  v_name text;
begin
  for r in
    select a.id, a.user_id, a.position, a.trainee_until
    from public.recruitment_applications a
    join public.recruitment_positions p on p.id = a.position_id
    where a.status = 'accepted'
      and p.is_trainee = true
      and a.promoted_at is null
      and a.trainee_until is not null
      and a.trainee_until <= now() + interval '3 days'
      and (a.reminder_sent_at is null or a.reminder_sent_at < now() - interval '7 days')
  loop
    select display_name into v_name from public.profiles where id = r.user_id;

    -- 通知管理层
    insert into public.notifications (user_id, actor_id, type, content, link, is_read)
    select p.id, r.user_id, 'recruitment',
           '实习即将到期：' || coalesce(v_name, '成员') || '（' || coalesce(r.position, '') || '）将于 '
             || to_char(r.trainee_until, 'YYYY-MM-DD') || ' 到期，请评估是否转正',
           '/admin/recruitment',
           false
    from public.profiles p
    where p.role_level >= 40;

    -- 通知本人
    insert into public.notifications (user_id, actor_id, type, content, link, is_read)
    values (
      r.user_id, null, 'recruitment',
      '你的实习期（' || coalesce(r.position, '') || '）将于 '
        || to_char(r.trainee_until, 'YYYY-MM-DD') || ' 到期，请联系管理层进行转正评估',
      '/recruitment',
      false
    );

    update public.recruitment_applications
       set reminder_sent_at = now()
     where id = r.id;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reminded', v_count);
end
$fn$;

-- =============================================================================
-- STEP 4 · 申请状态变化时通知其他员工（不包括处理人与申请人）
-- =============================================================================
create or replace function public.rct_recruitment_notify_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_label text := case new.status
    when 'reviewing' then '审核中'
    when 'accepted'  then '已通过'
    when 'rejected'  then '未通过'
    else new.status
  end;
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, actor_id, type, content, link, is_read)
    select p.id, new.handled_by, 'recruitment',
           '招募申请状态更新：' || coalesce(new.position, '') || ' → ' || v_label,
           '/admin/recruitment',
           false
    from public.profiles p
    where p.role_level >= 40
      and p.id <> new.user_id
      and (new.handled_by is null or p.id <> new.handled_by);
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_recruitment_notify_status on public.recruitment_applications;
create trigger trg_recruitment_notify_status
  after update on public.recruitment_applications
  for each row execute function public.rct_recruitment_notify_status();

-- =============================================================================
-- STEP 5 · 论坛回复删除权限（作者本人或 Lv.70+）
-- =============================================================================
drop policy if exists "forum_replies_delete_author_or_manager" on public.forum_replies;
create policy "forum_replies_delete_author_or_manager"
  on public.forum_replies
  for delete
  to authenticated
  using (author_id = auth.uid() or public.rct_role_level() >= 70);

-- =============================================================================
-- STEP 6 · 收紧招募 RPC 执行权限
-- =============================================================================
do $rec_grants$
begin
  execute 'revoke all on function public.rct_recruitment_accept(bigint, text) from public';
  execute 'grant execute on function public.rct_recruitment_accept(bigint, text) to authenticated, service_role';
  execute 'revoke all on function public.rct_recruitment_promote(bigint) from public';
  execute 'grant execute on function public.rct_recruitment_promote(bigint) to authenticated, service_role';
  execute 'revoke all on function public.rct_recruitment_sync_position(bigint) from public';
  execute 'grant execute on function public.rct_recruitment_sync_position(bigint) to authenticated, service_role';
  execute 'revoke all on function public.rct_recruitment_can_approve(bigint) from public';
  execute 'grant execute on function public.rct_recruitment_can_approve(bigint) to authenticated, service_role';
  execute 'revoke all on function public.rct_recruitment_send_trainee_reminders() from public';
  execute 'grant execute on function public.rct_recruitment_send_trainee_reminders() to service_role';
  raise notice '招募 RPC 执行权限已收紧';
end
$rec_grants$;

commit;

-- V-TRAINEE-1
select name, is_trainee, trainee_days from public.recruitment_positions where is_trainee order by sort_order;

-- V-TRAINEE-2
select column_name from information_schema.columns
where table_schema='public' and table_name='recruitment_applications'
  and column_name in ('trainee_started_at','trainee_until','reminder_sent_at')
order by column_name;

-- V-TRAINEE-3
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('rct_recruitment_send_trainee_reminders','rct_recruitment_accept');

-- V-TRAINEE-4
select policyname from pg_policies
where schemaname='public' and tablename='forum_replies' and cmd='DELETE';

-- 回滚
-- drop trigger if exists trg_recruitment_notify_status on public.recruitment_applications;
-- drop function if exists public.rct_recruitment_notify_status();
-- drop function if exists public.rct_recruitment_send_trainee_reminders();
-- drop policy if exists "forum_replies_delete_author_or_manager" on public.forum_replies;
-- alter table public.recruitment_applications drop column if exists trainee_started_at, drop column if exists trainee_until, drop column if exists reminder_sent_at;
-- alter table public.recruitment_positions drop column if exists trainee_days;
