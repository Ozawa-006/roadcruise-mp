-- =============================================================================
-- RCT MP · 多职位（一个人最多 4 个职位）
-- 说明：
--   - profile_roles 保存全部职位；profiles.role / role_level 继续保存最高职位，
--     用于权限判断与旧页面兼容。
--   - 现有单职位写入（招募通过、管理后台旧逻辑）会自动“追加”为多职位，
--     不会覆盖已有职位。
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) 多职位表
create table if not exists public.profile_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null,
  level       integer not null default 10,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, role)
);

create index if not exists profile_roles_user_idx
  on public.profile_roles (user_id, level desc);

alter table public.profile_roles enable row level security;

drop policy if exists "profile_roles_select_public" on public.profile_roles;
create policy "profile_roles_select_public"
  on public.profile_roles
  for select
  to anon, authenticated
  using (true);

grant select on public.profile_roles to anon, authenticated;

-- 2) 最多 4 个职位
create or replace function public.rct_enforce_max_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.profile_roles
  where user_id = new.user_id;

  if v_count >= 4 then
    raise exception '一个账号最多只能拥有 4 个职位';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_profile_roles_max on public.profile_roles;
create trigger trg_profile_roles_max
  before insert on public.profile_roles
  for each row execute function public.rct_enforce_max_roles();

-- 3) 同步 profiles 的最高职位
create or replace function public.rct_sync_primary_role(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text;
  v_level integer;
begin
  if current_setting('rct.multi_role_sync', true) = 'on' then
    return;
  end if;

  perform set_config('rct.multi_role_sync', 'on', true);

  select role, level into v_role, v_level
  from public.profile_roles
  where user_id = p_user
  order by level desc, assigned_at asc
  limit 1;

  update public.profiles
     set role = coalesce(v_role, 'member'),
         role_level = coalesce(v_level, 10)
   where id = p_user;

  perform set_config('rct.multi_role_sync', '', true);
end
$fn$;

-- 4) profile_roles 变更后同步最高职位
create or replace function public.rct_profile_roles_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.rct_sync_primary_role(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end
$fn$;

drop trigger if exists trg_profile_roles_sync on public.profile_roles;
create trigger trg_profile_roles_sync
  after insert or update or delete on public.profile_roles
  for each row execute function public.rct_profile_roles_sync();

-- 5) 旧代码直接改 profiles.role 时自动追加职位（不覆盖已有职位）
create or replace function public.rct_grant_role_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if current_setting('rct.multi_role_sync', true) = 'on' then
    return new;
  end if;
  if new.role is null or new.role = '' then
    return new;
  end if;
  if old.role is not distinct from new.role
     and old.role_level is not distinct from new.role_level then
    return new;
  end if;

  insert into public.profile_roles (user_id, role, level)
  values (new.id, new.role, coalesce(new.role_level, 10))
  on conflict (user_id, role)
  do update set level = excluded.level;

  return new;
end
$fn$;

drop trigger if exists trg_profiles_grant_role on public.profiles;
create trigger trg_profiles_grant_role
  after update of role, role_level on public.profiles
  for each row execute function public.rct_grant_role_from_profile();

-- 6) 回填现有职位
insert into public.profile_roles (user_id, role, level)
select id, role, coalesce(role_level, 10)
from public.profiles
where role is not null and role <> ''
on conflict (user_id, role) do nothing;

-- 7) 设置用户职位（管理后台用，Lv.70+）
create or replace function public.rct_set_user_roles(p_user uuid, p_roles text[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller integer := public.rct_role_level();
  v_roles text[];
  v_role text;
  v_level integer;
begin
  if v_caller < 70 then
    raise exception '权限不足：需要 Lv.70 及以上' using errcode = '42501';
  end if;

  select array_agg(distinct r) into v_roles
  from unnest(coalesce(p_roles, array[]::text[])) as r
  where r is not null and r <> '';

  if v_roles is null then v_roles := array['member']::text[]; end if;
  if array_length(v_roles, 1) > 4 then
    raise exception '一个账号最多只能拥有 4 个职位';
  end if;

  -- 校验职位存在并同步等级
  foreach v_role in array v_roles loop
    select level into v_level from public.roles where name = v_role;
    if v_level is null then
      raise exception '职位不存在：%', v_role;
    end if;
  end loop;

  perform set_config('rct.multi_role_sync', 'on', true);

  delete from public.profile_roles
  where user_id = p_user and role <> all (v_roles);

  foreach v_role in array v_roles loop
    select level into v_level from public.roles where name = v_role;
    insert into public.profile_roles (user_id, role, level, assigned_by)
    values (p_user, v_role, v_level, auth.uid())
    on conflict (user_id, role) do update set level = excluded.level;
  end loop;

  perform set_config('rct.multi_role_sync', '', true);
  perform public.rct_sync_primary_role(p_user);

  return jsonb_build_object('ok', true, 'roles', to_jsonb(v_roles));
end
$fn$;

revoke all on function public.rct_set_user_roles(uuid, text[]) from public;
grant execute on function public.rct_set_user_roles(uuid, text[]) to authenticated, service_role;

commit;

select user_id, role, level from public.profile_roles order by user_id, level desc limit 20;
select name, display_name, level, color from public.roles order by level desc limit 5;
