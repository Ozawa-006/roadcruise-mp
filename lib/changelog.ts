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
    version: '0.0.28v',
    date: '2026-11-01',
    title: '安全富文本与头像管理',
    highlight: true,
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
