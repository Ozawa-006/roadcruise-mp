// lib/permissions.ts
// 社区权限的唯一事实来源（Single Source of Truth）。
//
// 背景：数据库 profiles 表同时存在 role（字符串）和 role_level（数字）两套体系，
// 历史上还出现过硬编码邮箱提权、60/80/90 阈值混用的问题。
// 本文件的约定：
//   1. 判权只依据 profiles.role_level（数字），role 字符串只用于展示别名；
//   2. 阈值统一按交接文档：Lv.100 开发者 / Lv.90 高级社区经理 / Lv.70 经理 /
//      Lv.40 工作人员 / Lv.10 普通注册司机；
//   3. 任何页面都不要再自建角色权重表，统一从这里导入。

/** 交接文档规定的固定等级 */
export const ROLE_LEVEL = {
  MEMBER: 10,
  STAFF: 40,
  MANAGER: 70,
  SENIOR_MANAGER: 90,
  DEVELOPER: 100,
} as const;

/**
 * role 字符串 -> 中文展示名。
 * 覆盖文档中的标准职位，并保留 director / community_moderator 等历史角色名用于展示。
 * 未收录的自定义职位请用 roleLabel()，它会回退到数据库里的原始 role 字符串。
 */
export const ROLE_LABELS: Record<string, string> = {
  developer: '开发者',
  senior_manager: '高级社区经理',
  manager: '社区经理',
  staff: '工作人员',
  community_moderator: '社区版主',
  moderator: '版主',
  director: '论坛总经理',
  member: '注册司机',
};

/**
 * 把数据库里的 role_level 归一化为合法等级。
 * 非法值（null / undefined / NaN / Infinity / 非数字）返回 0（视为无任何管理权限），
 * 负数返回 0，超过 100 的值按 100（开发者）处理并向下取整。
 */
export function levelOf(level: number | null | undefined): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) return 0;
  const normalized = Math.floor(level);
  if (normalized <= 0) return 0;
  return Math.min(normalized, ROLE_LEVEL.DEVELOPER);
}

/** 后台入口：工作人员 (Lv.40) 及以上 */
export function canAccessAdmin(level: number | null | undefined): boolean {
  return levelOf(level) >= ROLE_LEVEL.STAFF;
}

/** 人员与权限管理：经理 (Lv.70) 及以上 */
export function canManageUsers(level: number | null | undefined): boolean {
  return levelOf(level) >= ROLE_LEVEL.MANAGER;
}

/** 社区规则编辑：高级社区经理 (Lv.90) 及以上 */
export function canEditRules(level: number | null | undefined): boolean {
  return levelOf(level) >= ROLE_LEVEL.SENIOR_MANAGER;
}

/** 公告 / 官方新闻发布：工作人员 (Lv.40) 及以上
 *  交接文档口径：Lv.40 工作人员「可发新闻、进入后台」；官方公告版块发帖才是 Lv.70（见 canPostOfficialTopic）。
 *  若想收紧为「仅经理可发公告」，把这里改成 ROLE_LEVEL.MANAGER 即可，数据库侧同步改
 *  supabase/p0-hardening.sql 的 announcements_*_staff 策略。 */
export function canManageAnnouncements(level: number | null | undefined): boolean {
  return levelOf(level) >= ROLE_LEVEL.STAFF;
}

/** 官方公告版块发帖：经理 (Lv.70) 及以上 */
export function canPostOfficialTopic(level: number | null | undefined): boolean {
  return levelOf(level) >= ROLE_LEVEL.MANAGER;
}

/** 只按等级得到中文职位名；等级不在任何档位时返回“未分配” */
export function roleLabelFromLevel(level: number): string {
  const normalized = levelOf(level);
  if (normalized >= ROLE_LEVEL.DEVELOPER) return ROLE_LABELS.developer;
  if (normalized >= ROLE_LEVEL.SENIOR_MANAGER) return ROLE_LABELS.senior_manager;
  if (normalized >= ROLE_LEVEL.MANAGER) return ROLE_LABELS.manager;
  if (normalized >= ROLE_LEVEL.STAFF) return ROLE_LABELS.staff;
  if (normalized >= ROLE_LEVEL.MEMBER) return ROLE_LABELS.member;
  return '未分配';
}

/**
 * 展示用职位名：优先用 ROLE_LABELS 里的标准中文名；
 * 未知角色回退数据库里的原始 role 字符串；连 role 都没有时回退等级标签。
 */
export function roleLabel(
  role: string | null | undefined,
  level: number | null | undefined
): string {
  if (role) {
    const knownLabel = ROLE_LABELS[role];
    if (knownLabel) return knownLabel;
    if (role.trim()) return role;
  }
  return roleLabelFromLevel(level ?? 0);
}

/** 英文标题化：community_moderator -> Community Moderator。 */
function titleCaseRoleKey(key: string): string {
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * 公开页面用的英文职位名：role 为空时回退等级标签。
 * 与 roleLabel 并存，后台仍使用中文版本。
 */
export function roleLabelEn(
  role: string | null | undefined,
  level: number
): string {
  const key = role?.trim();
  if (key) {
    if (key === 'manager') return 'Community Manager';
    if (key === 'member') return 'Member';
    if (key === 'developer') return 'Developer';
    if (key === 'game_producer') return 'Game Producer';
    if (key === 'project_manager') return 'Project Manager';
    if (key.startsWith('senior_')) return `Senior ${titleCaseRoleKey(key.slice(7))}`;
    return titleCaseRoleKey(key);
  }
  return `Level ${level}`;
}
