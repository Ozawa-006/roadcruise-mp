// lib/changelog.ts
// 站内更新日志的静态数据。纯前端数据，不读写数据库。
// 新增版本时把最新条目放在数组最前面，并给最新版本标 highlight: true。

export type ChangeKind = 'feature' | 'fix' | 'security' | 'chore';

export interface ChangeItem {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogEntry {
  version: string; // 如 '0.0.26v'
  date: string; // '2026-11-01'
  title: string;
  /** 可选英文标题；英文模式优先使用，缺失时回退 title。 */
  title_en?: string;
  summary?: string;
  /** 可选英文摘要；英文模式优先使用，缺失时回退 summary。 */
  summary_en?: string;
  items: ChangeItem[];
  /** 可选英文条目，必须与 items 一一对应（同数量、同顺序）；缺失项回退中文。 */
  items_en?: string[];
  commit?: string; // 可选：提交短哈希
  highlight?: boolean;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.0.46v',
    date: '2026-11-02',
    title: '后台英文化、编辑历史、举报升级与公告统一',
    title_en: 'English admin, edit history, report escalation and unified announcements',
    highlight: true,
    items: [
      {
        kind: 'feature',
        text: '后台管理页支持中英双语：仪表盘、用户、新闻、规则、活动、举报、审计、处罚、招募页面的静态 UI 均可切换英文',
      },
      {
        kind: 'feature',
        text: '论坛帖子/回复新增编辑历史：自动记录改动前后内容、编辑者与时间，公开可查看',
      },
      {
        kind: 'feature',
        text: '举报超时自动升级：24h 未处理通知 Lv.70+，48h 通知 Lv.90+，72h 后每 24h 继续提醒；后台列表标记「超时未处理」',
      },
      {
        kind: 'feature',
        text: '官方公告统一：论坛「官方公告与新闻」版块改为只读展示后台发布的 announcements，点击进入 /news/{id}，不再与论坛帖子两套内容',
      },
      {
        kind: 'chore',
        text: '新增 `content_edits` 表与触发器、举报升级字段；pg_cron 改为 `rct-site-hourly`（招募 + 举报升级）',
      },
    ],
    items_en: [
      'Admin pages now support Chinese/English: dashboard, users, news, rules, events, reports, audit, moderation and recruitment UIs can switch to English',
      'Forum topics and replies now keep an edit history: before/after content, editor and timestamp are recorded and publicly viewable',
      'Reports auto-escalate when overdue: 24h notify Lv.70+, 48h notify Lv.90+, then remind every 24h after 72h; the admin list marks overdue reports',
      'Official announcements are unified: the forum board now shows announcements from the admin news page as read-only cards linking to /news/{id}',
      'Added the `content_edits` table and triggers, report escalation fields, and switched pg_cron to `rct-site-hourly` (recruitment + report escalation)',
    ],
  },
  {
    version: '0.0.45v',
    date: '2026-11-02',
    title: '社区规则与更新日志双语',
    title_en: 'Bilingual community rules and changelog',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '社区规则支持中英双语：新增 title_en/content_en/penalty_en 字段，12 条规则已补英文；英文模式按语言显示，后台可编辑英文',
      },
      {
        kind: 'feature',
        text: '更新日志全部 25 个版本、110 条记录补英文标题与条目；英文模式显示英文，缺失回退中文',
      },
      {
        kind: 'chore',
        text: '已有中文规则/日志内容不修改；新增 `supabase/rules-english.sql`',
      },
    ],
    items_en: [
      'Community rules now support Chinese and English: added title_en / content_en / penalty_en fields, English available for all 12 rules, editable in the admin page',
      'The changelog now has English titles and entries for all 25 versions and 110 items; English mode prefers English and falls back to Chinese',
      'Existing Chinese rule and changelog content is unchanged; added `supabase/rules-english.sql`',
    ],
  },
  {
    version: '0.0.44v',
    date: '2026-11-02',
    title: '英文模式 UI 全英文化与内容双语',
    title_en: 'English UI coverage and bilingual content',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '英文模式下补齐剩余 UI：角色/职位标签英文化、富文本编辑器工具栏、导航兜底文案、页面 metadata（title/description）英文化',
      },
      {
        kind: 'feature',
        text: '帖子与公告支持可选英文翻译字段（title_en / content_en）：发帖、编辑、公告发布均可填写；英文模式优先显示英文，未翻译时回退原中文',
      },
      {
        kind: 'feature',
        text: '论坛版块名称与简介增加英文（官方公告/综合讨论/帮助支持），英文模式显示英文',
      },
      {
        kind: 'chore',
        text: '已发布的中文帖子/公告不修改；新增 `supabase/bilingual-content.sql`',
      },
      {
        kind: 'fix',
        text: '404 / 加载中 / 路由错误 / 全局错误页与语言切换提示在英文模式下不再出现中文',
      },
    ],
    items_en: [
      'English mode now covers the remaining UI: role and position labels, the rich-text editor toolbar, navigation fallbacks, and page metadata (title/description)',
      'Posts and announcements support optional English fields (title_en / content_en) when creating, editing, and publishing; English mode shows the translation first and falls back to the original Chinese',
      'Forum board names and descriptions now have English variants (Official Announcements / General Discussion / Help and Support), shown in English mode',
      'Existing Chinese posts and announcements are left untouched; adds `supabase/bilingual-content.sql`',
      '404 / loading / route error / global error pages and the language-switch notice no longer show Chinese in English mode',
    ],
  },
  {
    version: '0.0.43v',
    date: '2026-11-02',
    title: '中英双语语言系统',
    title_en: 'Bilingual Chinese-English language system',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新增语言系统：简体中文 / English；导航栏「🌐」切换，Cookie + localStorage 记忆，服务端渲染同步',
      },
      {
        kind: 'feature',
        text: '首页、导航/页脚、登录注册、论坛、新闻、活动、车队、个人资料、账号设置、通知、搜索、规则、服务器、更新日志、地图等主要页面完成英文翻译',
      },
      {
        kind: 'chore',
        text: '后台管理页保持中文（工作人员使用）；新增 `lib/i18n.ts`、`lib/i18n-server.ts`、`I18nProvider`、`LanguageSwitcher`',
      },
    ],
    items_en: [
      'New language system: Simplified Chinese / English; switch via the globe control in the navbar, remembered with Cookie + localStorage and synced during server rendering',
      'English translation completed for the main pages: home, navbar/footer, sign-in and sign-up, forum, news, events, VTC, profile, account settings, notifications, search, rules, servers, changelog, map and more',
      'Admin pages stay in Chinese for staff; adds `lib/i18n.ts`, `lib/i18n-server.ts`, `I18nProvider`, `LanguageSwitcher`',
    ],
  },
  {
    version: '0.0.42v',
    date: '2026-11-02',
    title: '撤回申请与招募统计',
    title_en: 'Application withdrawal and recruitment stats',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '申请人可撤回「待审核/审核中」的申请（状态变为已撤回），撤回后可重新申请同一职位',
      },
      {
        kind: 'feature',
        text: '后台招募管理新增统计卡片：总申请 / 待审核 / 审核中 / 已通过 / 未通过 / 已撤回',
      },
      {
        kind: 'feature',
        text: '后台支持按当前筛选导出申请记录 CSV（最多 1000 条，含申请人、职位、状态、答案等）',
      },
      {
        kind: 'chore',
        text: '新增 `supabase/recruitment-withdraw.sql`；状态约束与通知文案补充「已撤回」',
      },
    ],
    items_en: [
      'Applicants can withdraw a pending or in-review application (status becomes Withdrawn), and can then apply for the same position again',
      'Admin recruitment adds stat cards: total / pending / in review / approved / rejected / withdrawn applications',
      'Export the currently filtered applications as CSV (up to 1000 rows, including applicant, position, status, answers and more)',
      'Adds `supabase/recruitment-withdraw.sql`; status constraints and notification copy now include Withdrawn',
    ],
  },
  {
    version: '0.0.41v',
    date: '2026-11-02',
    title: '招募通知按部门与逐级升级',
    title_en: 'Recruitment notifications by department and escalation',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新招募申请只通知该职位所属部门的经理（社区/活动/游戏/支持/开发线），不再全员通知；无对应经理时回退通知 Lv.90+，避免无人处理',
      },
      {
        kind: 'feature',
        text: '超时自动升级：24 小时未处理 → 通知高级经理；48 小时未处理 → 通知决策层（Lv.98+）；72 小时后每 24 小时继续提醒决策层',
      },
      {
        kind: 'chore',
        text: '启用 pg_cron，每小时执行一次「升级提醒 + 实习到期提醒」；移除 Vercel 每日 Cron 以避免重复',
      },
    ],
    items_en: [
      'New recruitment applications notify only the manager of the department owning the position (Community / Events / Games / Support / Development); falls back to Lv.90+ when no manager exists so nothing is left unattended',
      'Automatic escalation: unhandled after 24 hours → senior managers; after 48 hours → decision makers (Lv.98+); after 72 hours, remind decision makers every 24 hours',
      'Enables `pg_cron` to run escalation and internship-expiry reminders hourly; removes the Vercel daily cron to avoid duplicates',
    ],
  },
  {
    version: '0.0.40v',
    date: '2026-11-01',
    title: '实习期提醒与回复删除',
    title_en: 'Internship reminders and reply deletion',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '每个实习职位可配置实习期天数（默认 30 天）；通过实习申请后记录实习起止时间，后台显示「实习中 / 实习已到期 / 已转正」',
      },
      {
        kind: 'feature',
        text: '新增每日定时任务：实习期剩余 3 天内且未转正时，自动提醒所有 Lv.40+ 管理层与本人（7 天内不重复提醒）',
      },
      {
        kind: 'feature',
        text: '招募申请状态变化（开始审核/通过/拒绝）会自动通知其他管理层，便于协同处理',
      },
      {
        kind: 'feature',
        text: '论坛回复支持删除：作者本人或 Lv.70+ 管理层可删除，回复数由数据库触发器自动更新',
      },
      {
        kind: 'chore',
        text: '新增 `vercel.json` 每日 Cron（UTC 01:00）与 `/api/cron/recruitment-reminders`（CRON_SECRET 校验）；新增 `supabase/recruitment-trainee.sql`',
      },
    ],
    items_en: [
      'Each internship position can configure a duration in days (default 30); approving an application records the start and end dates, and admin shows Internship active / Internship expired / Converted',
      'New daily cron: reminds all Lv.40+ management and the member when an internship is within 3 days of expiry and not yet converted (no repeat within 7 days)',
      'Recruitment application status changes (review started / approved / rejected) notify other management automatically for coordinated handling',
      'Forum replies can be deleted by their author or Lv.70+ management; reply counts are updated by a database trigger',
      'Adds `vercel.json` daily cron (UTC 01:00) and `/api/cron/recruitment-reminders` (CRON_SECRET check); adds `supabase/recruitment-trainee.sql`',
    ],
  },
  {
    version: '0.0.39v',
    date: '2026-11-01',
    title: '审核权限与历史申请职位同步',
    title_en: 'Review permissions and historical position sync',
    highlight: false,
    items: [
      {
        kind: 'security',
        text: '招募审核权限收紧：只有该职位对应部门经理及以上可「通过/转正/同步职位」（社区线需社区经理及以上；Lv.90 高级经理与 Lv.100 开发者可跨部门），RPC 内强制执行',
      },
      {
        kind: 'feature',
        text: '后台已通过申请新增「同步职位」按钮，用于补同步历史申请；已对已通过的 CC 申请补同步为「活动策划 (Event Planner) Lv.60」',
      },
      {
        kind: 'feature',
        text: '新增独立职级「活动策划 (Event Planner) Lv.60」，使资料页职位名与申请职位一致',
      },
      {
        kind: 'chore',
        text: '新增 `supabase/recruitment-permissions.sql` 与一次性 `recruitment-backfill.sql`',
      },
    ],
    items_en: [
      'Tighter recruitment review permissions: only the manager of the position department or above can approve / convert / sync positions (Community requires Community Manager or above; Lv.90 Senior Manager and Lv.100 Developer can cross departments), enforced inside the RPC',
      'Admin approved applications gain a Sync position button to backfill historical applications; the approved CC application was synced to Event Planner Lv.60',
      'Adds the standalone rank Event Planner Lv.60 so profile position names match the applied position',
      'Adds `supabase/recruitment-permissions.sql` and a one-off `recruitment-backfill.sql`',
    ],
  },
  {
    version: '0.0.38v',
    date: '2026-11-01',
    title: '招募转正同步与团队变更',
    title_en: 'Recruitment conversion sync and team changes',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '招募通过时自动同步申请人职位：后台可为每个职位配置「通过后授予角色」，正式岗位直接授职，实习岗位先授予实习角色',
      },
      {
        kind: 'feature',
        text: '新增实习体系：实习社区版主 / 实习游戏管理员 / 实习支持员 / 实习翻译 / 实习活动执行；后台对已通过的实习申请可一键「转正」为正式职位',
      },
      {
        kind: 'feature',
        text: '论坛首页新增「团队职位变更」卡片：自动展示最近加入/晋升/降职/实习/职位变更记录',
      },
      {
        kind: 'chore',
        text: '新增 `team_changes` 表与 profiles 角色变更触发器；新增 RPC `rct_recruitment_accept` / `rct_recruitment_promote`',
      },
    ],
    items_en: [
      'Approved recruitment automatically syncs the applicant position: admin can configure the role granted on approval per position — full roles are granted directly, internships grant the trainee role first',
      'New internship system: Trainee Community Moderator / Trainee Game Admin / Trainee Supporter / Trainee Translator / Trainee Event Staff; approved internship applications can be converted to the full role in one click',
      'Forum home adds a Team position changes card showing recent joins, promotions, demotions, internships and position changes',
      'Adds the `team_changes` table and a profiles role-change trigger; adds RPCs `rct_recruitment_accept` / `rct_recruitment_promote`',
    ],
  },
  {
    version: '0.0.37v',
    date: '2026-11-01',
    title: '招募文案编辑与申请通知',
    title_en: 'Recruitment copy editing and application notifications',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '后台 `/admin/recruitment` 恢复「招募文案」编辑：可修改招募页标题、介绍与任职要求（保存后公开页立即生效）',
      },
      {
        kind: 'feature',
        text: '玩家提交招募申请后，自动给所有 Lv.40+ 员工发站内通知（含职位名称，链接到后台审核页）',
      },
      {
        kind: 'chore',
        text: '新增 `supabase/recruitment-notify-staff.sql` 触发器；已实测申请插入后员工通知 +1',
      },
    ],
    items_en: [
      'Restores recruitment copy editing at `/admin/recruitment`: edit the page title, intro and requirements (changes take effect on the public page immediately after saving)',
      'Submitting a recruitment application notifies all Lv.40+ staff in-site with the position name and a link to the admin review page',
      'Adds the `supabase/recruitment-notify-staff.sql` trigger; verified that an inserted application raises staff notifications by 1',
    ],
  },
  {
    version: '0.0.36v',
    date: '2026-11-01',
    title: '招募职位独立开关与专属问题',
    title_en: 'Per-position recruitment toggles and custom questions',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '每个招募职位可单独「开放/关闭」，公开页只显示开放中的职位；总开关关闭时全部不可申请',
      },
      {
        kind: 'feature',
        text: '每个职位可配置专属申请问题（文本/多行/下拉、是否必填、下拉选项）；公开页按职位动态生成申请表单，答案随申请保存',
      },
      {
        kind: 'feature',
        text: '后台支持职位增删改、排序、逐职位开关、问题编辑器；申请列表可按职位/状态筛选并展开查看答案',
      },
      {
        kind: 'chore',
        text: '数据库新增 `recruitment_positions`；申请记录新增 `position_id`/`answers`；唯一约束改为「同一用户同一职位只能有一条待处理」',
      },
      {
        kind: 'chore',
        text: '已预置 5 个职位与 TMP 风格通用/专属问题（默认关闭，由后台开启）',
      },
      {
        kind: 'fix',
        text: '总开关关闭时公开页不再把任何职位显示为「开放中」；问题类型切换去掉不安全的类型断言',
      },
    ],
    items_en: [
      'Each recruitment position can be opened or closed individually; the public page lists only open positions, and the master switch disables all applications',
      'Each position can define custom application questions (text / textarea / select, required flag, options); the public page builds the form per position and stores answers with the application',
      'Admin supports position create/edit/delete, ordering, per-position toggles and a question editor; the application list filters by position/status and expands answers',
      'Database adds `recruitment_positions`; applications add `position_id`/`answers`; the unique constraint becomes one pending application per user per position',
      'Ships 5 positions with TMP-style general and position-specific questions (closed by default; staff enable them in admin)',
      'With the master switch off the public page no longer marks any position as open; question-type switching drops an unsafe type assertion',
    ],
  },
  {
    version: '0.0.35v',
    date: '2026-11-01',
    title: '招募系统上线',
    title_en: 'Recruitment system launch',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新增公开招募页 `/recruitment`：展示招募状态、团队介绍、任职要求与职位列表；开放时可提交申请（职位/联系方式/说明）并查看自己的申请进度',
      },
      {
        kind: 'feature',
        text: '新增后台 `/admin/recruitment`：一键开启/关闭招募资格、编辑标题/介绍/要求/职位，审核申请（审核中/通过/拒绝 + 备注）',
      },
      {
        kind: 'feature',
        text: '申请状态变化自动发站内通知；同一用户同时只能有一条待处理申请；未完成 Steam 验证或招募关闭时数据库层直接拦截',
      },
      {
        kind: 'chore',
        text: '论坛侧栏「招募 (Recruitment)」入口改为指向 `/recruitment`；补充默认招募文案（职位/要求可在后台修改）',
      },
    ],
    items_en: [
      'Adds the public recruitment page `/recruitment`: recruitment status, team intro, requirements and position list; when open, submit an application (position / contact / notes) and track its progress',
      'Adds admin `/admin/recruitment`: one-click open/close recruitment, edit title/intro/requirements/positions, review applications (in review / approve / reject + notes)',
      'Status changes send in-site notifications; a user can have only one pending application; the database blocks applications without Steam verification or while recruitment is closed',
      'Forum sidebar Recruitment entry now points to `/recruitment`; default recruitment copy added (positions and requirements editable in admin)',
    ],
  },
  {
    version: '0.0.34v',
    date: '2026-11-01',
    title: '图床链接插入（路过图床）',
    title_en: 'Image host link insertion (imgchr)',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '富文本图片按钮改为两种图床链接插入方式：「完整图片」直接插入 `![描述](图片URL)`；「缩略图」插入 `[![缩略图](thumb)](大图链接)`，点击缩略图可看大图',
      },
      {
        kind: 'feature',
        text: '适配路过图床（imgchr.com / ax1x.com）生成的「图片URL链接」「缩略图URL链接」；粘贴任意 http(s) 图床地址即可',
      },
      {
        kind: 'chore',
        text: '移除编辑器内「上传图片」本地 Storage 按钮（`post-images` 桶保留备用，未删除数据）',
      },
      {
        kind: 'fix',
        text: '修复论坛侧栏「VTC System」死链（原指向不存在的 `/forum/4`），改为「VTC 车队系统」→ `/vtc`',
      },
    ],
    items_en: [
      'The rich-text image button now offers two image-host insertion modes: Full image inserts `![alt](image URL)`; Thumbnail inserts `[![thumb](thumb URL)](full image URL)` so clicking the thumbnail opens the full image',
      'Supports the image URL and thumbnail URL links generated by imgchr.com / ax1x.com; any http(s) image-host address can be pasted',
      'Removes the editor upload-image button backed by local Storage (the `post-images` bucket is kept for later use; no data deleted)',
      'Fixes the dead VTC System link in the forum sidebar (previously pointed to the missing `/forum/4`); now VTC Fleet System → `/vtc`',
    ],
  },
  {
    version: '0.0.33v',
    date: '2026-11-01',
    title: '富文本图片上传',
    title_en: 'Rich-text image upload',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '富文本编辑器新增「上传图片」：发帖/回帖/公告/车队新闻/活动描述可直接上传 JPG/PNG/WebP（≤5MB）并插入正文，不再只支持外链图床',
      },
      {
        kind: 'feature',
        text: '新增 Supabase Storage 桶 `post-images`：公开读、仅登录用户可写自己目录、支持删除自己的图片（单文件 5MB、类型白名单）',
      },
      {
        kind: 'chore',
        text: '上传失败/未登录/超限在编辑器内红字提示；上传中按钮禁用防重复',
      },
    ],
    items_en: [
      'The rich-text editor adds Upload image: posts, replies, announcements, VTC news and event descriptions can upload JPG/PNG/WebP (≤5MB) and insert it inline, not just external image hosts',
      'Adds the Supabase Storage bucket `post-images`: public read, signed-in users write only to their own folder, own images can be deleted (5MB per file, type allowlist)',
      'Upload failure / signed-out / size limit errors show in red inside the editor; the button is disabled while uploading to prevent duplicates',
    ],
  },
  {
    version: '0.0.32v',
    date: '2026-11-01',
    title: '邮件通道与找回密码上线',
    title_en: 'Email channel and password reset launch',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '自助找回密码正式可用：登录页「忘记密码？」→ 阿里云邮件推送发送重置邮件 → `/reset-password` 设置新密码（实测 QQ 邮箱可正常收到）',
      },
      {
        kind: 'feature',
        text: '认证邮件沿用 Supabase 默认英文模板（按站长要求不中文化），发件人显示 `RCT MP`',
      },
      {
        kind: 'chore',
        text: 'Supabase 自定义 SMTP（smtpdm.aliyun.com:465 SSL）配置完成；认证邮件限流由 2 封/小时提高到 30 封/小时',
      },
      {
        kind: 'chore',
        text: '发信域名 `mail.roadcruise-mp.com` 完成 SPF / DKIM / DMARC / MX 解析验证',
      },
      {
        kind: 'fix',
        text: '修复找回密码邮件链接落到首页的问题：根布局检测到 recovery hash 时自动跳转 `/reset-password`',
      },
    ],
    items_en: [
      'Self-service password reset is live: Forgot password? on the sign-in page → Alibaba Cloud DirectMail sends the reset email → `/reset-password` sets a new password (verified with a QQ mailbox)',
      'Auth emails keep the default Supabase English templates (kept in English per the site owner) and the sender shows `RCT MP`',
      'Supabase custom SMTP (`smtpdm.aliyun.com:465` SSL) is configured; the auth email rate limit is raised from 2 to 30 per hour',
      'Sending domain `mail.roadcruise-mp.com` passed SPF / DKIM / DMARC / MX verification',
      'Fixes reset links landing on the home page: the root layout detects the recovery hash and redirects to `/reset-password`',
    ],
  },
  {
    version: '0.0.31v',
    date: '2026-11-01',
    title: '账号找回与后台分页',
    title_en: 'Account recovery and admin pagination',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新增忘记密码流程：登录页「忘记密码？」发送重置邮件，邮件链接进入 `/reset-password` 设置新密码（仅接受真实的重置链接，普通登录态无法直接改密）',
      },
      {
        kind: 'feature',
        text: '后台审计日志与举报处理改为服务端分页（每页 50 条，支持筛选、总数、页码）',
      },
      {
        kind: 'feature',
        text: '后台用户管理与处罚记录改为服务端分页 + 服务端搜索/筛选（昵称、专属 ID、SteamID、角色、动作、状态）',
      },
      {
        kind: 'chore',
        text: 'Supabase Auth 的 Site URL 改为 `https://www.roadcruise-mp.com`，Redirect allow list 同时包含带/不带 www 的域名',
      },
      {
        kind: 'chore',
        text: '注意：自助找回邮件需要项目配置自定义 SMTP 才能向所有用户发信（Supabase 默认邮件服务仅限项目成员）；代码流程已就绪',
      },
    ],
    items_en: [
      'Adds the forgot-password flow: Forgot password? on the sign-in page sends a reset email, and the link opens `/reset-password` to set a new password (only genuine reset links are accepted; a normal session cannot change it directly)',
      'Admin audit log and reports use server-side pagination (50 per page, with filters, totals and page numbers)',
      'Admin user management and moderation records use server-side pagination plus server-side search/filter (nickname, custom ID, SteamID, role, action, status)',
      'Supabase Auth Site URL is now `https://www.roadcruise-mp.com`, and the redirect allow list includes both the www and non-www domains',
      'Note: self-service reset emails need custom SMTP configured on the project to reach all users (the default Supabase mailer only reaches project members); the code path is ready',
    ],
  },
  {
    version: '0.0.30v',
    date: '2026-11-01',
    title: '团队架构与社区治理',
    title_en: 'Team structure and community governance',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新增「团队与组织架构」页 `/team`：按部门分组展示在任成员，完整职位一览与沟通/汇报关系说明（参考 TruckersMP 官方团队页口径，非晋升阶梯）',
      },
      {
        kind: 'feature',
        text: '新增处罚管理 `/admin/moderation`：警告 / 禁言 / 封禁（可设时长）、撤销、最近记录；生效中的禁言/封禁会阻止发帖、回帖、车队新闻、举报与活动报名',
      },
      {
        kind: 'feature',
        text: '个人资料页显示真实「当前处罚」状态（禁言中/封禁中与到期时间），不再写死 0',
      },
      {
        kind: 'feature',
        text: '首页资讯统一为官方公告数据源：后台 `/admin/news` 发布的公告直接展示在首页轮播，不再与论坛公告版块两套内容',
      },
      {
        kind: 'feature',
        text: '论坛回复分页（每页 20 条），长帖不再一次性加载全部回复',
      },
      {
        kind: 'chore',
        text: '数据库新增 moderation_actions（RLS + 发文拦截触发器等）；roles 表改为公开只读以支撑团队页',
      },
    ],
    items_en: [
      'Adds the Team and organization page `/team`: active members grouped by department, a full position list, and communication/reporting lines (aligned with the TruckersMP team page, not a promotion ladder)',
      'Adds moderation admin `/admin/moderation`: warn / mute / ban (with duration), revoke, recent records; active mutes and bans block posting, replies, VTC news, reports and event registration',
      'Profile pages show the real current moderation status (muted/banned with expiry) instead of a hard-coded 0',
      'Home news now uses the official announcement source: announcements published at `/admin/news` appear in the home carousel, removing the duplicate forum announcement board',
      'Forum reply pagination (20 per page) so long threads no longer load every reply at once',
      'Database adds `moderation_actions` (RLS + posting-block triggers); the `roles` table becomes publicly readable to support the team page',
    ],
  },
  {
    version: '0.0.29v',
    date: '2026-11-01',
    title: '社区治理与帮助中心',
    title_en: 'Community governance and help center',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新增举报/申诉系统：`/reports` 提交举报并查看自己的处理进度，`/admin/reports` 由工作人员处理（开始处理/已处理/驳回 + 备注），状态变化自动发站内通知',
      },
      {
        kind: 'feature',
        text: '论坛帖子与回复支持作者编辑（Lv.70+ 可管理他人内容）；主帖与回复新增「举报」入口',
      },
      {
        kind: 'feature',
        text: '新增帮助与支持中心 `/support`（FAQ + 快捷入口）与客户端下载页 `/download`（启动器测试中，明确标注即将开放）',
      },
      {
        kind: 'feature',
        text: '账号设置支持修改密码（需先验证当前密码，至少 8 位）',
      },
      {
        kind: 'feature',
        text: '全站搜索增强：支持帖子 / 玩家 / 活动 / 新闻 / 车队 分类型搜索',
      },
      {
        kind: 'feature',
        text: '活动管理后台支持查看每个活动的报名名单（昵称、专属 ID、Steam 验证、备注、报名时间）',
      },
      {
        kind: 'chore',
        text: '数据库新增 reports 表与 RLS；论坛回复编辑在数据库层锁定归属字段（topic_id/author_id/created_at）',
      },
    ],
    items_en: [
      'Adds reporting/appeals: submit reports at `/reports` and track their progress; staff handle them at `/admin/reports` (start / resolved / dismissed + notes) with automatic status notifications',
      'Forum topics and replies can be edited by their authors (Lv.70+ can manage content from others); topics and replies gain a Report entry',
      'Adds the help and support center `/support` (FAQ + shortcuts) and the client download page `/download` (launcher in testing, clearly marked coming soon)',
      'Account settings support password changes (current password required, at least 8 characters)',
      'Site-wide search now covers posts / players / events / news / VTC fleets by type',
      'Event admin can view the registration list for each event (nickname, custom ID, Steam verification, notes, registration time)',
      'Database adds the `reports` table and RLS; reply editing locks ownership fields at the database level (`topic_id`/`author_id`/`created_at`)',
    ],
  },
  {
    version: '0.0.28v',
    date: '2026-11-01',
    title: '安全富文本与头像管理',
    title_en: 'Safe rich text and avatar management',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '发帖/回帖、新闻公告、车队新闻、活动描述支持安全富文本（Markdown 子集：加粗/斜体/行内代码/链接/图片/引用/列表/二三级标题），自研解析无第三方依赖',
      },
      {
        kind: 'feature',
        text: '新增富文本编辑器：工具栏、实时预览、字数统计；链接/图片 URL 只允许 http(s)，非法语法按纯文本展示，全程不使用 innerHTML',
      },
      {
        kind: 'feature',
        text: '头像管理增强：仅允许 JPG/PNG/WebP 且 ≤2MB、选择后本地预览、替换时清理旧 Storage 头像、支持移除头像',
      },
      {
        kind: 'chore',
        text: '历史纯文本帖子/公告保持原样显示（换行保留），无需数据迁移',
      },
      {
        kind: 'fix',
        text: '多行引用回复：引用内容每一行都加 `> ` 前缀，富文本下正确显示为引用块',
      },
    ],
    items_en: [
      'Posts/replies, news announcements, VTC news and event descriptions support safe rich text (Markdown subset: bold/italic/inline code/links/images/quotes/lists/H2-H3), parsed in-house with no third-party dependency',
      'New rich-text editor: toolbar, live preview, character count; link/image URLs accept http(s) only, invalid syntax renders as plain text, and innerHTML is never used',
      'Avatar management: JPG/PNG/WebP only and ≤2MB, local preview after selection, old Storage avatars cleaned up on replacement, and avatars can be removed',
      'Legacy plain-text posts and announcements render unchanged (line breaks preserved), with no data migration',
      'Multi-line quoted replies prefix every line with `> `, rendering correctly as a quote block in rich text',
    ],
  },
  {
    version: '0.0.27v',
    date: '2026-11-01',
    title: '安全审计与内容初始化',
    title_en: 'Security audit and content bootstrap',
    highlight: false,
    items: [
      {
        kind: 'security',
        text: '新增操作审计日志（`audit_log` + 6 张表触发器）：记录权限、车队、活动、规则、新闻的关键变更；Lv.90+ 可在 `/admin/audit` 查看 before/after',
      },
      {
        kind: 'security',
        text: 'Steam 验证/回调/绑定与服务器状态代理加入 IP 限流（内存级兜底，多实例下计数不共享，强限流后续接 Upstash）',
      },
      {
        kind: 'feature',
        text: '初始化 12 条社区规则并发布到 `/rules`（分为社区总则、游戏与联运、论坛与交流、违规与处罚四部分），可在 `/admin/rules` 编辑',
      },
      {
        kind: 'chore',
        text: '更新安全文档：P1 收尾状态与限流局限说明',
      },
    ],
    items_en: [
      'Adds an operation audit log (`audit_log` + triggers on 6 tables) recording key changes to roles, VTC, events, rules and news; Lv.90+ can view before/after at `/admin/audit`',
      'IP rate limiting on Steam verification/callback/binding and the server status proxy (in-memory fallback; counters are not shared across instances, with Upstash planned for strict limits)',
      'Seeds 12 community rules and publishes them at `/rules` (general, game and cross-play, forum and communication, violations and penalties), editable at `/admin/rules`',
      'Updates security docs: P1 wrap-up status and rate-limit limitations',
    ],
  },
  {
    version: '0.0.26v',
    date: '2026-11-01',
    title: '内容生态与通知中心',
    title_en: 'Content ecosystem and notification center',
    commit: 'c5e2d92',
    highlight: false,
    items: [
      {
        kind: 'feature',
        text: '新增「车队专属新闻」页（`/vtc/[id]/news`），队长/副队长可发布、编辑、删除本队新闻',
      },
      {
        kind: 'feature',
        text: '新增「活动日历」视图（`/events/calendar`），月历浏览、按天查看活动',
      },
      {
        kind: 'feature',
        text: '新增「通知中心」页（`/notifications`），支持全部已读、只看未读、分页，导航栏铃铛加入口',
      },
      {
        kind: 'feature',
        text: '新增站内「更新日志」页（本页），记录每个版本的更新内容',
      },
      {
        kind: 'chore',
        text: '完善 sitemap / 页面入口',
      },
    ],
    items_en: [
      'Adds the VTC fleet news page (`/vtc/[id]/news`); fleet leaders and vice leaders can publish, edit and delete their fleet news',
      'Adds the event calendar view (`/events/calendar`) with month browsing and per-day events',
      'Adds the notification center (`/notifications`) with mark-all-read, unread-only and pagination; the navbar bell links to it',
      'Adds the in-site changelog page (this page) recording each release',
      'Polishes the sitemap and page entry points',
    ],
  },
  {
    version: '0.0.25v',
    date: '2026-11-01',
    title: '活动系统收尾',
    title_en: 'Event system wrap-up',
    commit: 'd27bce0',
    items: [
      {
        kind: 'fix',
        text: '活动描述为空时传空字符串，避免数据库 NOT NULL 报错',
      },
      {
        kind: 'fix',
        text: '活动列表在登出后重置工作人员权限状态',
      },
      {
        kind: 'chore',
        text: '数据库新增 custom_id（4-8 位数字）格式约束与唯一索引',
      },
    ],
    items_en: [
      'Send an empty string when the event description is empty to avoid a database NOT NULL error',
      'Reset staff permission state in the event list after sign-out',
      'Database adds a `custom_id` (4-8 digits) format constraint and unique index',
    ],
  },
  {
    version: '0.0.24v',
    date: '2026-11-01',
    title: '活动系统',
    title_en: 'Event system',
    commit: 'fb868be',
    items: [
      {
        kind: 'feature',
        text: '新增活动系统：活动列表 `/events`、活动详情 `/events/[id]`（报名/取消报名）、后台管理 `/admin/events`（新建/编辑/发布/取消/删除）',
      },
      {
        kind: 'feature',
        text: '首页「VTC Events」区块接真实活动数据，数据统计接已发布活动数',
      },
      {
        kind: 'feature',
        text: '导航栏「活动」下拉接入活动列表；工作人员可在后台控制台进入活动管理',
      },
      {
        kind: 'feature',
        text: '报名人数公开视图（不暴露报名者身份）；报名需 Steam 正版验证，支持名额上限',
      },
      {
        kind: 'security',
        text: '活动/报名表 RLS（匿名只读已发布活动；报名记录仅本人与工作人员可读）',
      },
    ],
    items_en: [
      'Adds the event system: event list `/events`, event detail `/events/[id]` (register/cancel), admin `/admin/events` (create/edit/publish/cancel/delete)',
      'The home VTC Events block now uses real event data, and the stats use the published event count',
      'The navbar Events dropdown links to the event list; staff can reach event admin from the admin console',
      'Public registration counts (without exposing attendee identities); registration requires Steam verification and supports a capacity limit',
      'RLS on events and registrations (anonymous read of published events only; registration rows readable by the owner and staff)',
    ],
  },
  {
    version: '0.0.23v',
    date: '2026-11-01',
    title: 'VTC 进阶管理',
    title_en: 'Advanced VTC management',
    commit: '843e1d5',
    items: [
      {
        kind: 'feature',
        text: '车队加入方式（开放加入/申请审批/仅邀请）；入队申请-审核流程；邀请加入；退出车队',
      },
      {
        kind: 'feature',
        text: '队员职位（队长/副队长/调度员/车手）、职位设置、踢人',
      },
      {
        kind: 'feature',
        text: '队长转让车队、解散车队（DISSOLVE 确认）',
      },
      {
        kind: 'feature',
        text: '车队管理操作自动发站内通知',
      },
      {
        kind: 'security',
        text: '所有跨用户车队操作走 SECURITY DEFINER RPC + 数据库校验，客户端无法绕过',
      },
    ],
    items_en: [
      'Fleet join modes (open / application review / invite only); the application-review flow; invite to join; leave fleet',
      'Member positions (leader / vice leader / dispatcher / driver), position settings, member removal',
      'Transfer fleet leadership, dissolve fleet (DISSOLVE confirmation)',
      'Fleet management actions send in-site notifications automatically',
      'All cross-user fleet operations go through SECURITY DEFINER RPCs with database checks; clients cannot bypass them',
    ],
  },
  {
    version: '0.0.22v',
    date: '2026-11-01',
    title: '网站体验与工程修补',
    title_en: 'Site experience and engineering fixes',
    commit: 'd384d59',
    items: [
      {
        kind: 'fix',
        text: '清理全站死链（我的车队/帮助/举报等），页脚与帮助入口指向真实页面',
      },
      {
        kind: 'feature',
        text: '新增 `/news` 新闻公告列表页（此前公告只有详情页）',
      },
      {
        kind: 'feature',
        text: '新增 404 / error / global-error / loading 兜底页',
      },
      {
        kind: 'feature',
        text: 'sitemap.xml、robots.txt、metadataBase/openGraph、`lang=zh-CN`',
      },
      {
        kind: 'security',
        text: '增加安全响应头（nosniff / Referrer-Policy / X-Frame-Options / Permissions-Policy / HSTS）',
      },
      {
        kind: 'fix',
        text: '地图页标注「演示数据」，服务器列表页提供友好空状态；导航栏在线人数 30s 轮询',
      },
    ],
    items_en: [
      'Cleans up dead links site-wide (my fleet / help / reports and more); footer and help entries point to real pages',
      'Adds the `/news` announcements list page (previously only detail pages existed)',
      'Adds 404 / error / global-error / loading fallback pages',
      'sitemap.xml, robots.txt, metadataBase/openGraph, `lang=zh-CN`',
      'Adds security response headers (nosniff / Referrer-Policy / X-Frame-Options / Permissions-Policy / HSTS)',
      'The map page is labeled demo data, the server list page has a friendly empty state, and the navbar online count polls every 30s',
    ],
  },
  {
    version: '0.0.21v',
    date: '2026-11-01',
    title: '安全加固 + 服务器列表',
    title_en: 'Security hardening + server list',
    commit: 'be957e8',
    items: [
      {
        kind: 'security',
        text: 'Steam 正版验证改为 OpenID 真验签（check_authentication），HMAC 签名 HttpOnly Cookie 注册闸门，服务端绑定接口',
      },
      {
        kind: 'security',
        text: '数据库 RLS 加固（28 条策略、守卫/计数触发器），清理旧宽松策略；撤销不可证明的历史验证',
      },
      {
        kind: 'security',
        text: '移除硬编码超管邮箱，统一 role_level 权限（10/40/70/90/100）',
      },
      {
        kind: 'feature',
        text: '服务器列表页 `/servers` + 服务端代理（对接游戏服 `/status`，当前留空等待软件测试完成）',
      },
    ],
    items_en: [
      'Steam ownership verification now does real OpenID signature checks (check_authentication), an HMAC-signed HttpOnly cookie registration gate, and a server-side binding endpoint',
      'Database RLS hardening (28 policies, guard/count triggers) and removal of old permissive policies; unprovable legacy verifications revoked',
      'Removes the hard-coded super-admin email and unifies `role_level` permissions (10/40/70/90/100)',
      'Server list page `/servers` plus a server-side proxy (talks to the game server `/status`, currently empty until software testing finishes)',
    ],
  },
  {
    version: '0.0.20v',
    date: '2026-11-01',
    title: 'VTC 基础功能',
    title_en: 'VTC basics',
    commit: '6f9559a',
    items: [
      {
        kind: 'feature',
        text: 'VTC 车队大厅、创建车队、车队详情、成员展示、加入/退出',
      },
      {
        kind: 'chore',
        text: '更早版本（0.0.08–0.0.19）以 VTC 功能迭代为主，详见 GitHub 提交历史',
      },
    ],
    items_en: [
      'VTC fleet lobby, fleet creation, fleet detail, member display, join/leave',
      'Earlier versions (0.0.08–0.0.19) were mostly VTC feature iterations; see the GitHub commit history',
    ],
  },
];
