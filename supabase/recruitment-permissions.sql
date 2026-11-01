-- =============================================================================
-- RCT MP · 招募审核权限（对应部门经理及以上）+ 已通过申请补同步职位
-- 前置：recruitment-sync.sql / recruitment-promote-flag.sql
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) 「活动策划」独立职级（让通过后的资料显示与申请职位一致）
insert into public.roles (name, display_name, level, department)
values ('event_planner', '活动策划 (Event Planner)', 60, '活动线')
on conflict (name) do update
  set display_name = excluded.display_name,
      level = excluded.level,
      department = excluded.department;

update public.recruitment_positions
   set assign_role = 'event_planner'
 where name = '活动策划'
   and (assign_role is null or assign_role = '' or assign_role = 'event_team');

-- 2) 审核权限：对应部门经理及以上（高级经理 / 开发者可跨部门）
create or replace function public.rct_recruitment_can_approve(p_position_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_level integer;
  v_role  text;
  v_dept  text;
begin
  if v_uid is null then return false; end if;

  select p.role_level, p.role
    into v_level, v_role
  from public.profiles p
  where p.id = v_uid;

  if v_level is null then return false; end if;

  -- 高级社区经理 / 高级游戏管理经理 / 高级活动经理 / 开发者可跨部门
  if v_level >= 90 then return true; end if;

  select department into v_dept
  from public.recruitment_positions
  where id = p_position_id;

  if v_dept is null then
    return v_level >= 70;
  end if;

  if v_dept = '社区线' then
    return v_role in ('manager', 'community_moderation_manager', 'media_manager', 'translation_manager');
  elsif v_dept = '活动线' then
    return v_role in ('event_manager');
  elsif v_dept = '游戏管理线' then
    return v_role in ('game_moderation_manager');
  elsif v_dept = '支持线' then
    return v_role in ('support_manager');
  else
    return v_level >= 70;
  end if;
end
$fn$;

-- 3) 通过申请：加入权限校验
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
begin
  if v_uid is null then raise exception '请先登录' using errcode = '42501'; end if;
  if v_level < 40 then raise exception '权限不足：需要 Lv.40+ 才能处理申请' using errcode = '42501'; end if;

  select a.id, a.user_id, a.status, a.position, a.position_id,
         p.assign_role, p.is_trainee, p.trainee_role
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
         handle_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), handle_note)
   where id = p_application_id;

  return jsonb_build_object(
    'ok', true,
    'role', v_role,
    'role_level', v_role_level,
    'trainee', coalesce(v_app.is_trainee, false)
  );
end
$fn$;

-- 4) 转正：同样要求对应部门经理及以上
create or replace function public.rct_recruitment_promote(p_application_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_level integer := public.rct_role_level();
  v_app   record;
  v_role_level integer;
begin
  if v_uid is null then raise exception '请先登录' using errcode = '42501'; end if;
  if v_level < 40 then raise exception '权限不足' using errcode = '42501'; end if;

  select a.id, a.user_id, a.status, a.position_id, a.promoted_at, p.assign_role, p.is_trainee
    into v_app
  from public.recruitment_applications a
  left join public.recruitment_positions p on p.id = a.position_id
  where a.id = p_application_id
  for update of a;

  if not found then raise exception '申请不存在'; end if;
  if v_app.status <> 'accepted' then raise exception '只有已通过的申请才能转正'; end if;
  if v_app.promoted_at is not null then raise exception '该申请已经转正，无需重复操作'; end if;
  if v_app.assign_role is null or v_app.assign_role = '' then
    raise exception '该职位没有配置正式角色，无法转正';
  end if;

  if not public.rct_recruitment_can_approve(v_app.position_id) then
    raise exception '权限不足：只有该职位对应的部门经理及以上可以转正'
      using errcode = '42501';
  end if;

  select level into v_role_level from public.roles where name = v_app.assign_role;
  if v_role_level is null then raise exception '角色不存在：%', v_app.assign_role; end if;

  perform set_config('rct.recruitment_admin', 'on', true);
  update public.profiles
     set role = v_app.assign_role,
         role_level = v_role_level
   where id = v_app.user_id;

  update public.recruitment_applications
     set promoted_at = now(),
         handle_note = concat_ws('；', nullif(handle_note, ''), '已转正')
   where id = p_application_id;

  return jsonb_build_object('ok', true, 'role', v_app.assign_role, 'role_level', v_role_level);
end
$fn$;

-- 5) 历史已通过申请补同步职位（用于修复本功能上线前已通过的申请）
create or replace function public.rct_recruitment_sync_position(p_application_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_level integer := public.rct_role_level();
  v_app   record;
  v_role  text;
  v_role_level integer;
begin
  if v_uid is null then raise exception '请先登录' using errcode = '42501'; end if;
  if v_level < 40 then raise exception '权限不足' using errcode = '42501'; end if;

  select a.id, a.user_id, a.status, a.position_id, a.promoted_at,
         p.assign_role, p.is_trainee, p.trainee_role
    into v_app
  from public.recruitment_applications a
  left join public.recruitment_positions p on p.id = a.position_id
  where a.id = p_application_id
  for update of a;

  if not found then raise exception '申请不存在'; end if;
  if v_app.status <> 'accepted' then raise exception '只有已通过的申请才能同步职位'; end if;

  if not public.rct_recruitment_can_approve(v_app.position_id) then
    raise exception '权限不足：只有该职位对应的部门经理及以上可以同步职位'
      using errcode = '42501';
  end if;

  v_role := case
    when v_app.is_trainee and v_app.promoted_at is null then v_app.trainee_role
    else v_app.assign_role
  end;

  if v_role is null or v_role = '' then
    raise exception '该职位没有配置授予角色，无法同步';
  end if;

  select level into v_role_level from public.roles where name = v_role;
  if v_role_level is null then raise exception '角色不存在：%', v_role; end if;

  perform set_config('rct.recruitment_admin', 'on', true);
  update public.profiles
     set role = v_role,
         role_level = v_role_level
   where id = v_app.user_id;

  return jsonb_build_object('ok', true, 'role', v_role, 'role_level', v_role_level);
end
$fn$;

commit;

-- V-PERM-1
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and proname in ('rct_recruitment_accept','rct_recruitment_promote','rct_recruitment_sync_position','rct_recruitment_can_approve');

-- V-PERM-2
select name, assign_role from public.recruitment_positions where name='活动策划';

-- 回滚
-- drop function if exists public.rct_recruitment_sync_position(bigint);
-- drop function if exists public.rct_recruitment_can_approve(bigint);
-- （accept/promote 恢复旧版请重跑 recruitment-sync.sql / recruitment-promote-flag.sql）
