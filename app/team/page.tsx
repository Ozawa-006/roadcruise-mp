// app/team/page.tsx
// 团队与组织架构：公开只读展示 roles（职位体系）与 profiles（Lv.40+ 在任成员）。
// 数据口径：profiles.role 匹配 roles.name 取部门/职位名；未匹配的成员归入「其他」。
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useTr, useLocale } from '../../components/I18nProvider';
import Navbar from '../../components/Navbar';
import { roleLabelEn } from '../../lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 静态 UI 文案：中文原文 -> 英文。英文缺失时 useTr 自动回退中文。
 * 按区块分组：页面头部 / 组织架构说明 / 在任成员 / 完整职位一览 / 加入团队 / 保留文案。
 * 说明：部门名（如「社区线」）、职位名（如「社区版主」）、等级数字与抓取日期属于数据结构，
 * 展示时优先使用 DEPARTMENT_META / 职位 display_name 中的英文，缺失则回退中文；
 * 这里只翻译页面自身的说明性文案与状态标签。
 */
const EN: Record<string, string> = {
  // ---------- 页面头部 ----------
  '团队与组织架构': 'Team & Organization',
  '了解 RCT MP 的部门划分、职位等级与当前在任成员。本页用于说明社区内的沟通与汇报关系，以及各职位的职责范围；等级只代表职责与站内权限，不代表玩家水平高低。':
    'Learn how RCT MP is organized: departments, rank levels and current active members. This page explains the communication and reporting lines inside the community, plus the scope of each rank; levels reflect responsibility and site permissions only, not player skill.',
  '个部门': 'departments',
  '个职位': 'positions',
  '位在任成员': 'active members',

  // ---------- 组织架构说明 ----------
  '关于这份组织架构图': 'About this organization chart',
  '本页展示的是沟通 / 汇报关系，不是晋升阶梯。':
    'This page shows communication and reporting lines, not a promotion ladder.',
  '职位等级用于说明职责范围与站内权限，不构成任何晋升承诺，也不代表玩家之间的高低。':
    'Rank levels describe the scope of responsibility and site permissions. They are not a promotion promise and do not imply any hierarchy between players.',
  'RCT MP 是玩家社区团队，全体成员均为志愿者；与 SCS Software、TruckersMP 无隶属关系。':
    'RCT MP is a player community team. Every member is a volunteer; we are not affiliated with SCS Software or TruckersMP.',
  '本站不是 TruckersMP 的官方分支，也不代表 SCS Software。':
    'This site is not an official branch of TruckersMP and does not represent SCS Software.',
  '职位体系参考 TruckersMP 官方 Meet the Team / Ranks 整理，':
    'The rank system is based on the official TruckersMP Meet the Team / Ranks page,',
  '仅用于说明本社区的职位名称与职责；具体权限以站内实际设置为准。':
    'and is only used to explain rank names and responsibilities in this community. Actual permissions follow the site settings.',
  '志愿者社区': 'Volunteer community',
  '所有团队成员均为志愿者，不领取报酬。请尊重他们的时间与劳动。':
    'Every team member is a volunteer and is not paid. Please respect their time and work.',
  '招募不收取任何费用，请勿轻信“付费入队”或“内部推荐”。':
    'Recruitment is always free. Do not trust any “pay to join” or “internal referral” offers.',

  // ---------- 在任成员 ----------
  '在任成员': 'Active members',
  '按所属部门分组，仅展示昵称、头像与公开职位信息；不展示 Steam ID、Discord ID 等隐私信息。':
    'Grouped by department. Only nicknames, avatars and public rank information are shown; private details such as Steam ID or Discord ID are not displayed.',
  '共 {count} 人': 'Total {count} members',
  '暂无在任成员': 'No active members',
  '暂无在任成员 · 招募中': 'No active members · Recruiting',
  '团队正在招募中，欢迎关注新闻公告中的招募信息。':
    'The team is recruiting. Watch the news announcements for recruitment posts.',
  '查看新闻公告 →': 'View news →',

  // ---------- 成员卡片 / 徽标 ----------
  '{count} 人': '{count} members',
  '未命名成员': 'Unnamed member',
  '未分配职位': 'Unassigned role',
  '未定级': 'Unranked',
  'Steam 已验证': 'Steam verified',
  'VTC 成员': 'VTC member',
  '{name} 的头像': '{name} avatar',

  // ---------- 完整职位一览 ----------
  '完整职位一览': 'Full rank list',
  '按部门分组 · 共 {count} 个职位 · 点击展开 / 收起':
    'Grouped by department · {count} ranks in total · Click to expand / collapse',
  '职位数据抓取于 2026-11，当前在任人数会随招募与离任变动。Lv.40 及以上为在任团队岗位，Lv.10 为注册司机基础等级。':
    'Rank data was captured in 2026-11; current headcount changes as people join or leave. Lv.40 and above are active staff positions, and Lv.10 is the base level for registered drivers.',
  '{count} 个职位': '{count} ranks',
  'Lv.98–100 决策层': 'Lv.98–100 Decision makers',
  'Lv.90–97 高级管理': 'Lv.90–97 Senior management',
  'Lv.70–89 经理': 'Lv.70–89 Managers',
  'Lv.40–69 组长 / 执行': 'Lv.40–69 Leads / Staff',
  'Lv.10–39 入门 / 实习': 'Lv.10–39 Entry / Trainee',

  // ---------- 职责层级 ----------
  '决策层': 'Decision makers',
  '高级管理': 'Senior management',
  '经理': 'Manager',
  '组长 / 执行': 'Lead / Staff',
  '入门 / 实习': 'Entry / Trainee',

  // ---------- 部门说明 ----------
  '项目方向与最终决策': 'Project direction and final decisions',
  '跨部门协调与社区运营': 'Cross-department coordination and community operations',
  '论坛秩序与社区沟通': 'Forum order and community communication',
  '游戏内违规处理与巡查': 'In-game rule enforcement and patrols',
  '联运与社区活动': 'Convoys and community events',
  '玩家问题与技术支持': 'Player issues and technical support',
  '网站与游戏功能开发': 'Website and game feature development',
  '新闻、社交与宣传素材': 'News, social media and promo material',
  '多语言内容与本地化': 'Multilingual content and localization',
  '版本与功能测试': 'Release and feature testing',
  '日常运营与一线执行': 'Daily operations and frontline work',
  '注册司机与社区基础成员': 'Registered drivers and community members',
  '暂未匹配到部门': 'No department matched yet',

  // ---------- 加载 / 错误 / 空状态 ----------
  '正在加载团队数据…': 'Loading team data…',
  '加载失败': 'Failed to load',
  '重试': 'Retry',
  '未知错误，请稍后重试': 'Unknown error. Please try again later.',

  // ---------- 加入团队 ----------
  '想加入团队？': 'Want to join the team?',
  '请关注': 'Keep an eye on',
  '新闻公告': 'News & announcements',
  '中的招募信息。团队只在需要时开放岗位，招募流程与要求以公告为准。':
    'for recruitment posts. Positions open only when needed; the process and requirements follow the announcement.',
  '对职位或申请流程有疑问，可到论坛帮助版块咨询；举报与申诉请走专用入口，不要在公开帖中发布他人隐私。':
    'If you have questions about ranks or the application process, ask in the forum help section. For reports and appeals, use the dedicated entry and never post other people’s private information publicly.',
  '帮助中心': 'Help center',
  '常见问题与操作指引': 'FAQs and how-to guides',
  '举报与申诉': 'Reports & appeals',
  '提交证据或对处理结果申诉': 'Submit evidence or appeal a decision',
  '申请 / 咨询': 'Apply / Ask',
  '到论坛帮助版块发帖': 'Post in the forum help section',
  '更新日志': 'Changelog',
  '查看站点功能与修复记录': 'Site features and fix history',
};

/** 员工判定：Lv.40 及以上（与 lib/permissions.ts 的 ROLE_LEVEL.STAFF 保持一致）。 */
const STAFF_LEVEL = 40;
const OTHER_DEPARTMENT = '其他';
/** 兜底错误文案（渲染时按当前语言翻译）。 */
const UNKNOWN_ERROR = '未知错误，请稍后重试';

interface RoleRow {
  name: string;
  display_name: string;
  level: number;
  department: string;
}

interface MemberRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  role_level: number | null;
  steam_verified: boolean | null;
  vtc_id: number | null;
  /** 公开自定义 ID；本页只查询不展示。 */
  custom_id: string | null;
}

interface TierInfo {
  label: string;
  className: string;
}

interface DepartmentMeta {
  en: string;
  description: string;
}

/** 部门展示顺序：从决策层到基础成员，未知部门追加在后面，「其他」始终最后。 */
const DEPARTMENT_ORDER: readonly string[] = [
  '顶层治理',
  '高层',
  '社区线',
  '游戏管理线',
  '活动线',
  '支持线',
  '开发团队',
  '媒体团队',
  '翻译团队',
  '测试团队',
  '执行层',
  '基础',
];

const DEPARTMENT_META: Record<string, DepartmentMeta | undefined> = {
  顶层治理: { en: 'Executive', description: '项目方向与最终决策' },
  高层: { en: 'Senior Leadership', description: '跨部门协调与社区运营' },
  社区线: { en: 'Community', description: '论坛秩序与社区沟通' },
  游戏管理线: { en: 'Game Moderation', description: '游戏内违规处理与巡查' },
  活动线: { en: 'Events', description: '联运与社区活动' },
  支持线: { en: 'Support', description: '玩家问题与技术支持' },
  开发团队: { en: 'Development', description: '网站与游戏功能开发' },
  媒体团队: { en: 'Media', description: '新闻、社交与宣传素材' },
  翻译团队: { en: 'Translation', description: '多语言内容与本地化' },
  测试团队: { en: 'Quality Assurance', description: '版本与功能测试' },
  执行层: { en: 'Staff', description: '日常运营与一线执行' },
  基础: { en: 'Base', description: '注册司机与社区基础成员' },
  其他: { en: 'Other', description: '暂未匹配到部门' },
};

/**
 * 完整职位一览的静态快照（2026-11 抓取，共 28 条）。
 * 数据库为唯一事实来源；这里仅用于在成员查询失败时也能展示职位体系。
 * 如后续 roles 表调整，请同步更新本数组。
 */
const RANKS: readonly RoleRow[] = [
  // 顶层治理
  { name: 'developer', display_name: '开发者 (Developer)', level: 100, department: '顶层治理' },
  { name: 'game_producer', display_name: '游戏制作人 (Game Producer)', level: 100, department: '顶层治理' },
  { name: 'project_manager', display_name: '项目经理 (Project Manager)', level: 98, department: '顶层治理' },
  // 高层
  { name: 'director', display_name: '论坛总经理 (Director)', level: 80, department: '高层' },
  { name: 'manager', display_name: '社区经理 (Manager)', level: 70, department: '高层' },
  // 社区线
  {
    name: 'senior_community_manager',
    display_name: '高级社区经理 (Senior Community Manager)',
    level: 90,
    department: '社区线',
  },
  {
    name: 'community_moderation_manager',
    display_name: '社区版主经理 (Community Moderation Manager)',
    level: 75,
    department: '社区线',
  },
  {
    name: 'community_moderation_leader',
    display_name: '社区版主组长 (Community Moderation Leader)',
    level: 60,
    department: '社区线',
  },
  {
    name: 'community_moderator',
    display_name: '社区版主 (Community Moderator)',
    level: 40,
    department: '社区线',
  },
  // 游戏管理线
  {
    name: 'senior_game_moderation_manager',
    display_name: '高级游戏管理经理 (Senior Game Moderation Manager)',
    level: 90,
    department: '游戏管理线',
  },
  {
    name: 'game_moderation_manager',
    display_name: '游戏管理经理 (Game Moderation Manager)',
    level: 75,
    department: '游戏管理线',
  },
  {
    name: 'game_moderation_leader',
    display_name: '游戏管理组长 (Game Moderation Leader)',
    level: 60,
    department: '游戏管理线',
  },
  {
    name: 'game_moderator',
    display_name: '游戏管理员 (Game Moderator)',
    level: 40,
    department: '游戏管理线',
  },
  {
    name: 'report_moderator',
    display_name: '举报处理员 (Report Moderator)',
    level: 30,
    department: '游戏管理线',
  },
  // 活动线
  {
    name: 'senior_event_manager',
    display_name: '高级活动经理 (Senior Event Manager)',
    level: 90,
    department: '活动线',
  },
  { name: 'event_manager', display_name: '活动经理 (Event Manager)', level: 75, department: '活动线' },
  { name: 'event_team', display_name: '活动执行团队 (Event Team)', level: 40, department: '活动线' },
  // 支持线
  {
    name: 'support_manager',
    display_name: '技术支持经理 (Support Manager)',
    level: 85,
    department: '支持线',
  },
  {
    name: 'support_team_leader',
    display_name: '支持组长 (Support Team Leader)',
    level: 60,
    department: '支持线',
  },
  { name: 'support', display_name: '支持员 (Support)', level: 40, department: '支持线' },
  // 开发团队
  { name: 'game_developer', display_name: '游戏开发者 (Game Developer)', level: 85, department: '开发团队' },
  { name: 'web_developer', display_name: '网站开发者 (Web Developer)', level: 80, department: '开发团队' },
  // 媒体团队
  { name: 'media_manager', display_name: '媒体经理 (Media Manager)', level: 75, department: '媒体团队' },
  // 翻译团队
  { name: 'translation_manager', display_name: '翻译经理 (Translation Manager)', level: 75, department: '翻译团队' },
  { name: 'translator', display_name: '翻译员 (Translator)', level: 40, department: '翻译团队' },
  // 测试团队
  { name: 'test_coordinator', display_name: '测试协调员 (Test Coordinator)', level: 60, department: '测试团队' },
  // 执行层 / 基础
  { name: 'staff', display_name: '工作人员 (Staff)', level: 40, department: '执行层' },
  { name: 'member', display_name: '注册司机 (Member)', level: 10, department: '基础' },
];

/** 等级 -> 职责层级。>=98 决策层，>=90 高级管理，70-89 经理，40-69 组长/执行，<40 入门。 */
function tierOf(level: number): TierInfo {
  if (level >= 98) {
    return { label: '决策层', className: 'border-red-500/40 bg-red-500/10 text-red-300' };
  }
  if (level >= 90) {
    return { label: '高级管理', className: 'border-orange-500/40 bg-orange-500/10 text-orange-300' };
  }
  if (level >= 70) {
    return { label: '经理', className: 'border-blue-500/40 bg-blue-500/10 text-blue-300' };
  }
  if (level >= 40) {
    return { label: '组长 / 执行', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' };
  }
  return { label: '入门 / 实习', className: 'border-gray-600 bg-[#18191c] text-gray-400' };
}

/** "社区版主 (Community Moderator)" -> { zh: "社区版主", en: "Community Moderator" } */
function splitDisplayName(displayName: string): { zh: string; en: string } {
  const matched = displayName.match(/^(.+?)\s*\(([^()]*)\)\s*$/);
  if (matched) {
    const zh = matched[1]?.trim() ?? '';
    const en = matched[2]?.trim() ?? '';
    if (zh && en) return { zh, en };
  }
  return { zh: displayName.trim(), en: '' };
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return UNKNOWN_ERROR;
}

/** 按「已知部门顺序 -> 未知部门 -> 其他」排列。 */
function orderDepartments(departments: ReadonlySet<string>): string[] {
  const known = DEPARTMENT_ORDER.filter((department) => departments.has(department));
  const unknown = [...departments]
    .filter((department) => !DEPARTMENT_ORDER.includes(department) && department !== OTHER_DEPARTMENT)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const ordered = [...known, ...unknown];
  if (departments.has(OTHER_DEPARTMENT)) ordered.push(OTHER_DEPARTMENT);
  return ordered;
}

interface DepartmentRanks {
  department: string;
  ranks: RoleRow[];
}

function groupRanksByDepartment(ranks: readonly RoleRow[]): DepartmentRanks[] {
  const groups = new Map<string, RoleRow[]>();
  for (const rank of ranks) {
    const department = rank.department.trim() || OTHER_DEPARTMENT;
    const bucket = groups.get(department);
    if (bucket) bucket.push(rank);
    else groups.set(department, [rank]);
  }

  for (const bucket of groups.values()) {
    bucket.sort((a, b) => b.level - a.level || a.display_name.localeCompare(b.display_name, 'zh-CN'));
  }

  return orderDepartments(new Set(groups.keys())).map((department) => ({
    department,
    ranks: groups.get(department) ?? [],
  }));
}

const RANKS_BY_DEPARTMENT = groupRanksByDepartment(RANKS);

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 bg-[#2c2d31] px-3 py-1 text-xs text-gray-500">
      <span className="font-mono font-bold text-gray-200">{value}</span>
      {label}
    </span>
  );
}

function LevelBadge({ level }: { level: number }) {
  const tr = useTr(EN);
  const tier = tierOf(level);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${tier.className}`}
    >
      <span className="font-mono">Lv.{level}</span>
      <span className="opacity-80">{tr(tier.label)}</span>
    </span>
  );
}

function SteamBadge() {
  const tr = useTr(EN);
  return (
    <span className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
      <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      {tr('Steam 已验证')}
    </span>
  );
}

function MemberCard({ member, roleLabel }: { member: MemberRow; roleLabel: string }) {
  const tr = useTr(EN);
  const name = member.display_name?.trim() || tr('未命名成员');

  return (
    <article className="rounded-lg border border-gray-700 bg-[#2c2d31] p-3 transition hover:border-blue-500/50">
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-600 bg-gradient-to-br from-blue-600/30 to-[#18191c]">
          <span className="flex h-full w-full items-center justify-center text-lg font-black text-blue-200">
            {initialOf(name)}
          </span>
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={tr('{name} 的头像', { name })}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{name}</p>
          <p className="mt-0.5 truncate text-xs text-blue-300">{roleLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {member.role_level == null ? (
              <span className="rounded border border-gray-600 bg-[#18191c] px-1.5 py-0.5 text-[10px] font-bold text-gray-400">
                {tr('未定级')}
              </span>
            ) : (
              <LevelBadge level={member.role_level} />
            )}
            {member.steam_verified === true && <SteamBadge />}
            {member.vtc_id != null && (
              <span className="inline-flex items-center rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-300">
                {tr('VTC 成员')}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function DepartmentCard({
  department,
  members,
  roleByName,
}: {
  department: string;
  members: MemberRow[];
  roleByName: ReadonlyMap<string, RoleRow>;
}) {
  const tr = useTr(EN);
  const locale = useLocale();
  const meta = DEPARTMENT_META[department];
  const isLeadership = department === '顶层治理' || department === '高层';
  const departmentName = locale === 'en' && meta ? meta.en : department;

  return (
    <div
      className={`rounded-xl border p-4 ${
        members.length > 0
          ? 'border-gray-700 bg-[#232428]'
          : 'border-dashed border-gray-700/70 bg-[#232428]/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className={`mt-1 h-5 w-1 shrink-0 rounded-full ${isLeadership ? 'bg-orange-500' : 'bg-blue-500'}`}
          />
          <div className="min-w-0">
            <h3 className="text-base font-black text-white">{departmentName}</h3>
            {meta ? (
              <p className="text-[11px] text-gray-500">
                {locale === 'en' ? tr(meta.description) : `${meta.en} · ${tr(meta.description)}`}
              </p>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-gray-700 bg-[#18191c] px-2 py-0.5 text-[10px] font-bold text-gray-500">
          {tr('{count} 人', { count: members.length })}
        </span>
      </div>

      {members.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-gray-700 bg-[#18191c]/50 px-3 py-3 text-center text-xs text-gray-500">
          {tr('暂无在任成员 · 招募中')}
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {members.map((member) => {
            const role = member.role ? roleByName.get(member.role) : undefined;
            const roleText = role
              ? locale === 'en'
                ? splitDisplayName(role.display_name).en || roleLabelEn(role.name, role.level)
                : splitDisplayName(role.display_name).zh
              : member.role?.trim()
                ? locale === 'en'
                  ? roleLabelEn(member.role, 0)
                  : member.role.trim()
                : tr('未分配职位');
            return <MemberCard key={member.id} member={member} roleLabel={roleText} />;
          })}
        </div>
      )}
    </div>
  );
}

function LoadingBlock() {
  const tr = useTr(EN);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 flex items-center gap-3 rounded-xl border border-gray-700 bg-[#2c2d31] p-6 text-sm text-gray-400"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400"
      />
      {tr('正在加载团队数据…')}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tr = useTr(EN);
  return (
    <div role="alert" className="mt-4 rounded-xl border border-red-700 bg-red-900/20 p-5">
      <h3 className="text-base font-black text-red-300">{tr('加载失败')}</h3>
      <p className="mt-1 break-words text-sm text-red-200/80">
        {message === UNKNOWN_ERROR ? tr(UNKNOWN_ERROR) : message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        {tr('重试')}
      </button>
    </div>
  );
}

function EmptyBlock() {
  const tr = useTr(EN);
  return (
    <div className="mt-4 rounded-xl border border-dashed border-gray-700 bg-[#2c2d31] p-8 text-center">
      <p aria-hidden="true" className="text-3xl">
        🛠️
      </p>
      <h3 className="mt-2 text-lg font-black text-white">{tr('暂无在任成员')}</h3>
      <p className="mt-1 text-sm text-gray-500">{tr('团队正在招募中，欢迎关注新闻公告中的招募信息。')}</p>
      <Link
        href="/news"
        className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        {tr('查看新闻公告 →')}
      </Link>
    </div>
  );
}

function TierPill({ level, label }: { level: number; label: string }) {
  const tier = tierOf(level);
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${tier.className}`}>{label}</span>;
}

function ActionLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-gray-700 bg-[#18191c] p-3 transition hover:border-blue-500/50 hover:bg-[#232428]"
    >
      <span className="flex items-center justify-between gap-2 text-sm font-bold text-gray-200 transition group-hover:text-white">
        {title}
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
      <span className="mt-1 block text-[11px] leading-4 text-gray-500">{description}</span>
    </Link>
  );
}

export default function TeamPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [membersResult, rolesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,display_name,avatar_url,role,role_level,steam_verified,vtc_id,custom_id')
          .gte('role_level', STAFF_LEVEL)
          .order('role_level', { ascending: false })
          .order('display_name', { ascending: true }),
        supabase.from('roles').select('name,display_name,level,department'),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (rolesResult.error) throw rolesResult.error;

      setMembers((membersResult.data ?? []) as unknown as MemberRow[]);
      setRoles((rolesResult.data ?? []) as unknown as RoleRow[]);
    } catch (loadError: unknown) {
      setMembers([]);
      setRoles([]);
      setError(errorMessageOf(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadData();
    })();
  }, [loadData]);

  // 重试在事件回调里同步置为加载态，effect 内只发起请求，避免级联渲染。
  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    void loadData();
  }, [loadData]);

  const roleByName = useMemo(() => {
    const map = new Map<string, RoleRow>();
    for (const role of roles) map.set(role.name, role);
    return map;
  }, [roles]);

  /**
   * 在任成员按 roles.department 分组：
   * - 部门列表取「已知部门 + roles 实际部门 + 成员实际部门」，保证没有成员的部门也能展示招募状态；
   * - 匹配不到 roles.name 的成员归入「其他」。
   */
  const memberDepartments = useMemo(() => {
    const groups = new Map<string, MemberRow[]>();
    for (const member of members) {
      const role = member.role ? roleByName.get(member.role) : undefined;
      const department = role?.department?.trim() || OTHER_DEPARTMENT;
      const bucket = groups.get(department);
      if (bucket) bucket.push(member);
      else groups.set(department, [member]);
    }

    const departments = new Set<string>(DEPARTMENT_ORDER);
    for (const role of roles) {
      const department = role.department?.trim();
      if (department) departments.add(department);
    }
    for (const department of groups.keys()) departments.add(department);

    return orderDepartments(departments).map((department) => ({
      department,
      members: groups.get(department) ?? [],
    }));
  }, [members, roleByName, roles]);

  const memberCountLabel = loading ? '…' : error ? '—' : String(members.length);

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <header className="border-b border-gray-700 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-400">
            RCT MP · Team &amp; Ranks
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">{tr('团队与组织架构')}</h1>
            <span className="text-lg font-bold text-gray-500 md:text-xl">/ Team &amp; Ranks</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            {tr('了解 RCT MP 的部门划分、职位等级与当前在任成员。本页用于说明社区内的沟通与汇报关系，以及各职位的职责范围；等级只代表职责与站内权限，不代表玩家水平高低。')}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <StatPill label={tr('个部门')} value={String(RANKS_BY_DEPARTMENT.length)} />
            <StatPill label={tr('个职位')} value={String(RANKS.length)} />
            <StatPill label={tr('位在任成员')} value={memberCountLabel} />
          </div>
        </header>

        {/* 重要说明 */}
        <section aria-labelledby="team-notice" className="mt-6">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#2c2d31] via-[#2c2d31] to-[#232428] p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-400">
                  Before You Read
                </p>
                <h2 id="team-notice" className="mt-1 text-xl font-black text-white">
                  {tr('关于这份组织架构图')}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Communication chart, not a promotion chart.
                </p>

                <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-400">
                  <li className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <p>
                      <strong className="font-bold text-gray-200">
                        {tr('本页展示的是沟通 / 汇报关系，不是晋升阶梯。')}
                      </strong>
                      {tr('职位等级用于说明职责范围与站内权限，不构成任何晋升承诺，也不代表玩家之间的高低。')}
                    </p>
                  </li>
                  <li className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <p>
                      <strong className="font-bold text-gray-200">
                        {tr('RCT MP 是玩家社区团队，全体成员均为志愿者；与 SCS Software、TruckersMP 无隶属关系。')}
                      </strong>
                      {tr('本站不是 TruckersMP 的官方分支，也不代表 SCS Software。')}
                    </p>
                  </li>
                  <li className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <p>
                      <strong className="font-bold text-gray-200">
                        {tr('职位体系参考 TruckersMP 官方 Meet the Team / Ranks 整理，')}
                      </strong>
                      {tr('仅用于说明本社区的职位名称与职责；具体权限以站内实际设置为准。')}
                    </p>
                  </li>
                </ul>
              </div>

              <div className="shrink-0 rounded-xl border border-gray-700 bg-[#18191c] p-4 lg:w-56">
                <p className="text-sm font-black text-gray-200">{tr('志愿者社区')}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  {tr('所有团队成员均为志愿者，不领取报酬。请尊重他们的时间与劳动。')}
                </p>
                <p className="mt-3 border-t border-gray-800 pt-3 text-[11px] leading-5 text-gray-600">
                  {tr('招募不收取任何费用，请勿轻信“付费入队”或“内部推荐”。')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 在任成员 */}
        <section aria-labelledby="team-members" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-700 pb-3">
            <div>
              <h2 id="team-members" className="text-xl font-black text-white">
                {tr('在任成员')}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {tr('按所属部门分组，仅展示昵称、头像与公开职位信息；不展示 Steam ID、Discord ID 等隐私信息。')}
              </p>
            </div>
            <span className="text-xs text-gray-600">{tr('共 {count} 人', { count: memberCountLabel })}</span>
          </div>

          {loading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock message={error} onRetry={handleRetry} />
          ) : (
            <>
              {members.length === 0 && <EmptyBlock />}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {memberDepartments.map(({ department, members: departmentMembers }) => (
                  <DepartmentCard
                    key={department}
                    department={department}
                    members={departmentMembers}
                    roleByName={roleByName}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* 完整职位一览 */}
        <section aria-labelledby="team-ranks" className="mt-10">
          <details open className="group rounded-2xl border border-gray-700 bg-[#232428]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 md:px-5 [&::-webkit-details-marker]:hidden">
              <div>
                <h2 id="team-ranks" className="text-xl font-black text-white">
                  {tr('完整职位一览')}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {tr('按部门分组 · 共 {count} 个职位 · 点击展开 / 收起', { count: RANKS.length })}
                </p>
              </div>
              <svg
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>

            <div className="border-t border-gray-700 px-4 py-4 md:px-5">
              <p className="text-xs leading-5 text-gray-500">
                {tr('职位数据抓取于 2026-11，当前在任人数会随招募与离任变动。Lv.40 及以上为在任团队岗位，Lv.10 为注册司机基础等级。')}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <TierPill level={100} label={tr('Lv.98–100 决策层')} />
                <TierPill level={90} label={tr('Lv.90–97 高级管理')} />
                <TierPill level={70} label={tr('Lv.70–89 经理')} />
                <TierPill level={40} label={tr('Lv.40–69 组长 / 执行')} />
                <TierPill level={10} label={tr('Lv.10–39 入门 / 实习')} />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {RANKS_BY_DEPARTMENT.map(({ department, ranks }) => (
                  <div key={department} className="rounded-xl border border-gray-700 bg-[#2c2d31] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-black text-white">
                        {locale === 'en'
                          ? DEPARTMENT_META[department]?.en ?? department
                          : department}
                      </h3>
                      <span className="rounded-full border border-gray-700 bg-[#18191c] px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        {tr('{count} 个职位', { count: ranks.length })}
                      </span>
                    </div>

                    <ul className="mt-2 divide-y divide-gray-700/60">
                      {ranks.map((rank) => {
                        const name = splitDisplayName(rank.display_name);
                        const tier = tierOf(rank.level);
                        const rankName =
                          locale === 'en'
                            ? name.en || roleLabelEn(rank.name, rank.level)
                            : name.zh;
                        return (
                          <li
                            key={rank.name}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-200">{rankName}</p>
                              {locale !== 'en' && name.en ? (
                                <p className="font-mono text-[10px] uppercase tracking-wide text-gray-500">
                                  {name.en}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${tier.className}`}
                              >
                                {tr(tier.label)}
                              </span>
                              <span className="rounded bg-[#18191c] px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-400">
                                Lv.{rank.level}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>

        {/* 行动区 */}
        <section
          aria-labelledby="team-join"
          className="mt-10 overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-[#2c2d31] via-[#2c2d31] to-[#232428] p-5 md:p-7"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-blue-400">
                Join the Team
              </p>
              <h2 id="team-join" className="mt-1 text-2xl font-black text-white">
                {tr('想加入团队？')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                {tr('请关注')}
                <Link
                  href="/news"
                  className="mx-1 font-bold text-blue-400 underline decoration-blue-500/30 underline-offset-2 transition hover:text-blue-300"
                >
                  {tr('新闻公告')}
                </Link>
                {tr('中的招募信息。团队只在需要时开放岗位，招募流程与要求以公告为准。')}
              </p>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                {tr('对职位或申请流程有疑问，可到论坛帮助版块咨询；举报与申诉请走专用入口，不要在公开帖中发布他人隐私。')}
              </p>
            </div>

            <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:w-[420px]">
              <ActionLink href="/support" title={tr('帮助中心')} description={tr('常见问题与操作指引')} />
              <ActionLink href="/reports" title={tr('举报与申诉')} description={tr('提交证据或对处理结果申诉')} />
              <ActionLink href="/forum/3" title={tr('申请 / 咨询')} description={tr('到论坛帮助版块发帖')} />
              <ActionLink href="/changelog" title={tr('更新日志')} description={tr('查看站点功能与修复记录')} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
