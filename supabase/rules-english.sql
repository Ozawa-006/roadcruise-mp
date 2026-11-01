-- =============================================================================
-- RCT MP · 社区规则英文内容
-- 前置：rules 初始内容已写入（p0 阶段）
-- 说明：新增英文列，已有中文内容不修改；英文为空时英文界面回退中文。
-- =============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.rules_articles add column if not exists title_en text;
alter table public.rules_articles add column if not exists content_en text;
alter table public.rules_articles add column if not exists penalty_en text;

update public.rules_articles set
  title_en = 'Respect every player',
  content_en = 'No personal attacks, discrimination, harassment or malicious provocation. Disagreements are fine, but keep it civil and focus on the issue, not the person.',
  penalty_en = 'Warning → Mute'
where article_number = '1.1';

update public.rules_articles set
  title_en = 'One account per person',
  content_en = 'Each player may own only one community account. Sharing, selling or transferring accounts is prohibited. You are responsible for everything done on your account.',
  penalty_en = 'Warning → Ban'
where article_number = '1.2';

update public.rules_articles set
  title_en = 'Do not impersonate staff',
  content_en = 'Do not impersonate administrators, developers or official staff, and do not forge screenshots, announcements or system messages.',
  penalty_en = 'Mute → Ban'
where article_number = '1.3';

update public.rules_articles set
  title_en = 'Follow traffic and convoy rules',
  content_en = 'During convoys, follow basic traffic rules, keep a safe distance and stay in formation. Ramming, blocking roads, brake-checking or causing accidents on purpose is prohibited.',
  penalty_en = 'Warning → Mute → Ban'
where article_number = '2.1';

update public.rules_articles set
  title_en = 'No cheating or unfair advantages',
  content_en = 'Do not use any third-party programs, mods or exploits that affect fair play, and do not abuse bugs for unfair gains.',
  penalty_en = 'Ban → Permanent ban'
where article_number = '2.2';

update public.rules_articles set
  title_en = 'Report accidents proactively',
  content_en = 'If you are involved in an accident, report it in the Help & Support section. Hit-and-run, false reports or deleting evidence will be penalised more severely.',
  penalty_en = 'Warning → Mute'
where article_number = '2.3';

update public.rules_articles set
  title_en = 'Post in the right section with clear titles',
  content_en = 'Choose the correct section and use a clear title. Spamming, low-effort flooding and commercial advertising are prohibited.',
  penalty_en = 'Warning → Mute'
where article_number = '3.1';

update public.rules_articles set
  title_en = 'No prohibited content',
  content_en = 'Do not post illegal, infringing, pornographic, violent, gambling or scam content, and do not share other people''s private information.',
  penalty_en = 'Post removal → Mute → Ban'
where article_number = '3.2';

update public.rules_articles set
  title_en = 'Reports and appeals',
  content_en = 'If you find a violation, post in the Help & Support section or contact staff with the time, server and screenshots. Do not publicly shame other players.',
  penalty_en = '—'
where article_number = '3.3';

update public.rules_articles set
  title_en = 'Penalty levels',
  content_en = 'Penalties include warnings, mutes, temporary bans and permanent bans, depending on severity. Repeated violations lead to heavier penalties.',
  penalty_en = '—'
where article_number = '4.1';

update public.rules_articles set
  title_en = 'Appeal process',
  content_en = 'If you disagree with a penalty, submit an appeal in the Help & Support section. The moderation team will review it. Please stay civil during the process.',
  penalty_en = '—'
where article_number = '4.2';

update public.rules_articles set
  title_en = 'Final interpretation',
  content_en = 'The staff team reserves the right to interpret and adjust the rules. Updates will be announced in the news and changelog.',
  penalty_en = '—'
where article_number = '4.3';

commit;

select article_number, title, title_en from public.rules_articles order by section, article_number;
