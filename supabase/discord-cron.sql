-- =============================================================================
-- RCT MP · Discord 定时任务（每 12h 同步身份组 + 活动前 1h 提醒）
-- 依赖：pg_cron / pg_net / events / discord_accounts
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) 活动提醒去重字段
alter table public.events
  add column if not exists discord_reminder_sent_at timestamptz;

-- 2) pg_net（Supabase 支持）
create extension if not exists pg_net;

-- 3) 私有配置（cron secret / site url），不暴露给 API
create schema if not exists private;

create table if not exists private.cron_config (
  key   text primary key,
  value text not null
);

revoke all on schema private from public;
revoke all on all tables in schema private from public;

-- 4) 调用网站定时端点
create or replace function private.rct_post_cron(path text)
returns bigint
language plpgsql
security definer
set search_path = private, public, net, pg_temp
as $fn$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  select value into v_url from private.cron_config where key = 'site_url';
  select value into v_secret from private.cron_config where key = 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  select net.http_post(
    url := v_url || path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_id;

  return v_id;
end
$fn$;

-- 5) pg_cron 任务
do $cron_jobs$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('rct-event-reminders-hourly');
    exception when others then null;
    end;
    begin
      perform cron.unschedule('rct-discord-sync-12h');
    exception when others then null;
    end;

    perform cron.schedule(
      'rct-event-reminders-hourly',
      '5 * * * *',
      $job$select private.rct_post_cron('/api/cron/event-reminders');$job$
    );

    perform cron.schedule(
      'rct-discord-sync-12h',
      '7 0,12 * * *',
      $job$select private.rct_post_cron('/api/cron/discord-sync');$job$
    );
  end if;
end
$cron_jobs$;

commit;

-- 验证（需先写入 private.cron_config 才会真正请求）
select jobname, schedule, active from cron.job where jobname like 'rct-%';
select extname from pg_extension where extname in ('pg_net','pg_cron');
