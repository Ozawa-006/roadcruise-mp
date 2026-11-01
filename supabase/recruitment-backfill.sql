-- =============================================================================
-- RCT MP · 一次性补同步：把「已通过但尚未同步职位」的招募申请同步到 profiles
-- 说明：仅处理 status='accepted' 且职位配置了授予角色的申请；
--       实习且未转正 → 实习角色；已转正/正式岗位 → 正式角色。
-- =============================================================================

begin;

do $backfill$
declare
  r record;
  v_role text;
  v_level integer;
begin
  for r in
    select a.id, a.user_id, a.promoted_at,
           p.assign_role, p.is_trainee, p.trainee_role
    from public.recruitment_applications a
    join public.recruitment_positions p on p.id = a.position_id
    where a.status = 'accepted'
  loop
    v_role := case
      when r.is_trainee and r.promoted_at is null then r.trainee_role
      else r.assign_role
    end;

    if v_role is null or v_role = '' then
      continue;
    end if;

    select level into v_level from public.roles where name = v_role;
    if v_level is null then
      raise notice '跳过申请 %：角色 % 不存在', r.id, v_role;
      continue;
    end if;

    perform set_config('rct.recruitment_admin', 'on', true);

    update public.profiles
       set role = v_role,
           role_level = v_level
     where id = r.user_id
       and (role is distinct from v_role or role_level is distinct from v_level);

    if found then
      raise notice '申请 %：用户 % 已同步为 % (Lv.%)', r.id, r.user_id, v_role, v_level;
    end if;
  end loop;
end
$backfill$;

commit;

select p.display_name, p.role, p.role_level, a.status, a.position
from public.recruitment_applications a
join public.profiles p on p.id = a.user_id
where a.status = 'accepted';
