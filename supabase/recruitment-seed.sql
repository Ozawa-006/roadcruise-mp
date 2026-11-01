-- =============================================================================
-- RCT MP · 招募默认文案（可执行多次；只在对应字段为空时写入）
-- 说明：is_open 保持 false，由 /admin/recruitment 手动开启招募。
-- =============================================================================

begin;

update public.recruitment_settings
set
  title = case when coalesce(title, '') = '' or title = '加入 RCT MP 团队'
               then '加入 RCT MP 团队' else title end,
  intro = case when coalesce(intro, '') = '' then
    E'RCT MP 是一群热爱《欧洲卡车模拟2》的玩家组成的社区团队。\n我们负责社区运营、联运活动、游戏管理与技术支持，所有成员均为志愿者。\n如果你喜欢欧卡2、愿意帮助新玩家、并且能稳定参与社区事务，欢迎提交申请。'
  else intro end,
  requirements = case when coalesce(requirements, '') = '' then
    E'1. 拥有正版《欧洲卡车模拟2》，并已通过本站 Steam 验证；\n2. 年满 16 周岁，能够理性沟通、遵守社区规则；\n3. 每周能投入至少 3–5 小时处理团队事务；\n4. 有论坛/联运/活动组织经验者优先；\n5. 申请时请如实填写联系方式与可投入时间。'
  else requirements end,
  positions = case when coalesce(positions, '') = '' then
    E'社区版主 | 社区线 | 负责论坛与 Discord 版务、处理举报与申诉\n活动策划 | 活动线 | 规划联运路线、组织官方活动与车队管控\n游戏管理员 | 游戏管理线 | 游戏内巡查、处理违规与举报\n技术支持 | 支持线 | 协助新玩家解决联机、账号与技术问题\n翻译 / 媒体 | 社区线 | 翻译公告或制作宣传素材'
  else positions end,
  updated_at = now()
where id = 1;

commit;

select id, is_open, title, length(intro) as intro_len, length(requirements) as req_len, length(positions) as pos_len
from public.recruitment_settings;
