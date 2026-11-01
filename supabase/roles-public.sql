-- =============================================================================
-- RCT MP · 公开只读 roles（用于 /team 组织架构页）
-- 说明：roles 只包含职位名称/等级/部门，不含个人信息，公开只读无风险。
-- =============================================================================

begin;

do $roles_public$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'roles' and policyname = 'roles_select_public'
  ) then
    create policy "roles_select_public"
      on public.roles
      for select
      to anon, authenticated
      using (true);
    raise notice '已添加 roles 公开只读策略';
  else
    raise notice 'roles 公开只读策略已存在';
  end if;

  -- PostgREST 需要表级 SELECT 授权（部分环境默认只授权给 authenticated/service_role）
  execute 'grant select on public.roles to anon, authenticated';
  raise notice '已授予 roles 表 SELECT 权限';
end
$roles_public$;

commit;

select policyname, cmd, roles::text as applies_to
from pg_policies
where schemaname = 'public' and tablename = 'roles'
order by 1;
