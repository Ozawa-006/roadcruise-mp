-- =============================================================================
-- RCT MP · Discord OAuth 绑定 + Bot 身份组同步
-- 前置：profiles / roles / rct_role_level()
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) OAuth 一次性 state（服务端校验，防止 CSRF）
create table if not exists public.discord_oauth_states (
  state      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  next_path  text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.discord_oauth_states enable row level security;
-- 仅服务端 service_role 使用，不开放 select/insert 策略

-- 2) Discord 绑定账号
create table if not exists public.discord_accounts (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  discord_id   text not null unique,
  username     text not null,
  global_name  text,
  avatar_hash  text,
  guild_member boolean not null default false,
  guild_roles  text[] not null default '{}',
  linked_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists discord_accounts_discord_id_idx
  on public.discord_accounts (discord_id);

alter table public.discord_accounts enable row level security;

drop policy if exists "discord_accounts_select_own" on public.discord_accounts;
create policy "discord_accounts_select_own"
  on public.discord_accounts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "discord_accounts_select_staff" on public.discord_accounts;
create policy "discord_accounts_select_staff"
  on public.discord_accounts
  for select
  to authenticated
  using (public.rct_role_level() >= 90);

drop trigger if exists trg_discord_accounts_touch on public.discord_accounts;
create trigger trg_discord_accounts_touch
  before update on public.discord_accounts
  for each row execute function public.rct_touch_updated_at();

-- 3) 站点角色 -> Discord 身份组映射
create table if not exists public.discord_role_mappings (
  site_role         text primary key,
  discord_role_id   text not null,
  discord_role_name text,
  enabled           boolean not null default true,
  updated_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now()
);

alter table public.discord_role_mappings enable row level security;

drop policy if exists "discord_role_mappings_select_staff" on public.discord_role_mappings;
create policy "discord_role_mappings_select_staff"
  on public.discord_role_mappings
  for select
  to authenticated
  using (public.rct_role_level() >= 40);

-- 写操作只由服务端 service_role 执行（admin API）

commit;

select table_name from information_schema.tables
where table_schema='public' and table_name like 'discord_%' order by table_name;
