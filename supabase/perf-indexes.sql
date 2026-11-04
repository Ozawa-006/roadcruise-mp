-- =============================================================================
-- RCT MP · 性能小索引
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 公告列表/首页公告按时间倒序
create index if not exists announcements_created_idx
  on public.announcements (created_at desc);

-- 未读通知角标
create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

-- OAuth state 清理
create index if not exists discord_oauth_states_expires_idx
  on public.discord_oauth_states (expires_at);

-- 论坛主题列表（非公告版块）按时间
create index if not exists forum_topics_created_idx
  on public.forum_topics (created_at desc);

commit;

select indexname from pg_indexes
where schemaname='public'
  and indexname in (
    'announcements_created_idx',
    'notifications_unread_idx',
    'discord_oauth_states_expires_idx',
    'forum_topics_created_idx'
  )
order by indexname;
