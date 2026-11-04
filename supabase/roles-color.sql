-- =============================================================================
-- RCT MP · 角色颜色（网站 + Discord 身份组统一）
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.roles add column if not exists color text;

-- 决策/开发
update public.roles set color = '#ef4444' where name in ('developer','game_producer','project_manager');
-- 高级管理
update public.roles set color = '#f59e0b'
 where name in ('senior_community_manager','senior_event_manager','senior_game_moderation_manager','director');
-- 部门经理
update public.roles set color = '#3b82f6'
 where name in ('community_moderation_manager','event_manager','game_moderation_manager','media_manager','translation_manager','manager','support_manager','game_developer','web_developer');
-- 组长/策划/协调
update public.roles set color = '#8b5cf6'
 where name in ('community_moderation_leader','event_planner','game_moderation_leader','support_team_leader','test_coordinator');
-- 执行层
update public.roles set color = '#22c55e'
 where name in ('community_moderator','event_team','game_moderator','staff','support','translator');
-- 举报处理
update public.roles set color = '#14b8a6' where name = 'report_moderator';
-- 实习/成员
update public.roles set color = '#94a3b8'
 where name in ('community_moderation_trainee','event_trainee','game_moderation_trainee','support_trainee','translator_trainee','member');

update public.roles set color = '#9ca3af' where color is null;

commit;

select name, display_name, level, color from public.roles order by level desc, name;
