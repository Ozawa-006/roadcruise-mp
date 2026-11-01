-- =============================================================================
-- RCT MP · 招募转正标记（避免「转正」按钮重复出现）
-- =============================================================================

begin;

alter table public.recruitment_applications
  add column if not exists promoted_at timestamptz;

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

  select a.id, a.user_id, a.status, a.promoted_at, p.assign_role, p.is_trainee
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

commit;

select column_name from information_schema.columns
where table_schema='public' and table_name='recruitment_applications' and column_name='promoted_at';

-- 回滚
-- alter table public.recruitment_applications drop column if exists promoted_at;
-- （RPC 恢复上一版请重跑 recruitment-sync.sql 中定义）
