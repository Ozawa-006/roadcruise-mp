-- =============================================================================
-- RCT MP · 新招募申请通知管理层
-- 前置：recruitment.sql / recruitment-positions.sql
-- 说明：玩家提交申请后，给所有 Lv.40+ 员工写一条站内通知（不通知申请人自己）。
-- =============================================================================

begin;

create or replace function public.rct_recruitment_notify_staff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.notifications (user_id, actor_id, type, content, link, is_read)
  select
    p.id,
    new.user_id,
    'recruitment',
    '新的招募申请：' || coalesce(nullif(new.position, ''), '未命名职位'),
    '/admin/recruitment',
    false
  from public.profiles p
  where p.role_level >= 40
    and p.id <> new.user_id;

  return new;
end
$fn$;

drop trigger if exists trg_recruitment_notify_staff on public.recruitment_applications;
create trigger trg_recruitment_notify_staff
  after insert on public.recruitment_applications
  for each row execute function public.rct_recruitment_notify_staff();

commit;

-- 校验
select tgname, tgrelid::regclass::text as tbl
from pg_trigger
where tgname = 'trg_recruitment_notify_staff' and not tgisinternal;

-- 回滚
-- drop trigger if exists trg_recruitment_notify_staff on public.recruitment_applications;
-- drop function if exists public.rct_recruitment_notify_staff();
