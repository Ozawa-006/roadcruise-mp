-- =============================================================================
-- RCT MP · 申请人撤回 + 招募状态扩展（withdrawn）
-- 前置：recruitment-escalation.sql
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) 状态约束加入 withdrawn
alter table public.recruitment_applications
  drop constraint if exists recruitment_applications_status_check;
alter table public.recruitment_applications
  add constraint recruitment_applications_status_check
  check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'withdrawn'));

-- 2) 申请人撤回 RPC
create or replace function public.rct_recruitment_withdraw(p_application_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_app record;
begin
  if v_uid is null then raise exception '请先登录' using errcode = '42501'; end if;

  select id, user_id, status
    into v_app
  from public.recruitment_applications
  where id = p_application_id
  for update;

  if not found then raise exception '申请不存在'; end if;
  if v_app.user_id <> v_uid then raise exception '只能撤回自己的申请' using errcode = '42501'; end if;
  if v_app.status not in ('pending', 'reviewing') then
    raise exception '当前状态不可撤回（仅待审核/审核中可撤回）';
  end if;

  update public.recruitment_applications
     set status = 'withdrawn',
         handle_note = concat_ws('；', nullif(handle_note, ''), '申请人主动撤回')
   where id = p_application_id;

  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end
$fn$;

-- 3) 状态通知文案补「已撤回」
create or replace function public.rct_recruitment_notify()
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
    when 'withdrawn' then '已撤回'
    else new.status
  end;
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, actor_id, type, content, link, is_read)
    values (
      new.user_id,
      new.handled_by,
      'recruitment',
      '你的团队申请（' || new.position || '）状态已更新为：' || v_label,
      '/recruitment',
      false
    );
  end if;
  return new;
end
$fn$;

-- 4) 员工通知文案补「已撤回」
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
    when 'withdrawn' then '已撤回'
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

-- 5) 执行权限
do $withdraw_grants$
begin
  execute 'revoke all on function public.rct_recruitment_withdraw(bigint) from public';
  execute 'grant execute on function public.rct_recruitment_withdraw(bigint) to authenticated, service_role';
end
$withdraw_grants$;

commit;

select conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.recruitment_applications'::regclass and conname='recruitment_applications_status_check';

select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname='rct_recruitment_withdraw';
