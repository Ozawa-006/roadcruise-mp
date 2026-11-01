-- =============================================================================
-- RCT MP · 中英双语内容字段（论坛/公告）
-- 说明：
--   - 只新增可选的英文翻译列，已有中文内容不修改（英文为空时英文界面回退中文）。
--   - 论坛版块名/简介属于站点结构，预置英文。
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) 论坛版块
alter table public.forum_categories add column if not exists name_en text;
alter table public.forum_categories add column if not exists description_en text;

update public.forum_categories
   set name_en = 'Official Announcements & News',
       description_en = 'Official RCT MP announcements, game updates and important notices.'
 where id = 1;
update public.forum_categories
   set name_en = 'General Discussion',
       description_en = 'Talk about ETS2, share truck screenshots, recommend mods, or just chat.'
 where id = 2;
update public.forum_categories
   set name_en = 'Help & Support',
       description_en = 'Game errors, multiplayer issues or community questions? Post here for help.'
 where id = 3;

-- 2) 帖子（主题）
alter table public.forum_topics add column if not exists title_en text;
alter table public.forum_topics add column if not exists content_en text;

-- 3) 回复
alter table public.forum_replies add column if not exists content_en text;

-- 4) 公告
alter table public.announcements add column if not exists title_en text;
alter table public.announcements add column if not exists content_en text;

-- 5) 公开读列已由现有 SELECT 策略覆盖；写权限沿用现有 author/staff 策略
commit;

select id, name, name_en from public.forum_categories order by id;
select column_name from information_schema.columns
where table_schema='public'
  and ((table_name='forum_topics' and column_name in ('title_en','content_en'))
    or (table_name='forum_replies' and column_name='content_en')
    or (table_name='announcements' and column_name in ('title_en','content_en')));
