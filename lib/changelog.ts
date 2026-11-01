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
  summary?: string;
  items: ChangeItem[];
  commit?: string; // 可选：提交短哈希
  highlight?: boolean;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.0.32v',
    date: '2026-11-01',
    title: '邮件通道与找回密码上线',
    highlight: true,
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
    ],
  },
  {
    version: '0.0.31v',
    date: '2026-11-01',
    title: '账号找回与后台分页',
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
  },
  {
    version: '0.0.30v',
    date: '2026-11-01',
    title: '团队架构与社区治理',
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
  },
  {
    version: '0.0.29v',
    date: '2026-11-01',
    title: '社区治理与帮助中心',
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
  },
  {
    version: '0.0.28v',
    date: '2026-11-01',
    title: '安全富文本与头像管理',
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
  },
  {
    version: '0.0.27v',
    date: '2026-11-01',
    title: '安全审计与内容初始化',
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
  },
  {
    version: '0.0.26v',
    date: '2026-11-01',
    title: '内容生态与通知中心',
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
  },
  {
    version: '0.0.25v',
    date: '2026-11-01',
    title: '活动系统收尾',
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
  },
  {
    version: '0.0.24v',
    date: '2026-11-01',
    title: '活动系统',
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
  },
  {
    version: '0.0.23v',
    date: '2026-11-01',
    title: 'VTC 进阶管理',
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
  },
  {
    version: '0.0.22v',
    date: '2026-11-01',
    title: '网站体验与工程修补',
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
  },
  {
    version: '0.0.21v',
    date: '2026-11-01',
    title: '安全加固 + 服务器列表',
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
  },
  {
    version: '0.0.20v',
    date: '2026-11-01',
    title: 'VTC 基础功能',
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
  },
];
