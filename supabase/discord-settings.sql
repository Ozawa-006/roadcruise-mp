-- =============================================================================
-- RCT MP · Discord 验证设置（已验证身份组等）
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.discord_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.discord_settings enable row level security;

drop policy if exists "discord_settings_select_staff" on public.discord_settings;
create policy "discord_settings_select_staff"
  on public.discord_settings
  for select
  to authenticated
  using (public.rct_role_level() >= 40);

commit;

select key, value from public.discord_settings;
