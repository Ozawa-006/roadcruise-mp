// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTr } from '@/components/I18nProvider';
import {
  canAccessAdmin,
  canEditRules,
  canManageAnnouncements,
  canManageUsers,
  levelOf,
  roleLabel,
  roleLabelEn,
} from '@/lib/permissions';

/** 静态 UI 文案：中文原文 -> 英文。英文缺失时 useTr 自动回退中文。 */
const EN: Record<string, string> = {
  // ---------- 页面外壳 ----------
  '验证权限中...': 'Checking permissions...',

  // ---------- 标题与身份 ----------
  '🛡️ 社区控制台': '🛡️ Community Console',
  '当前身份：': 'Signed in as: ',

  // ---------- 功能卡片 ----------
  '员工与权限管理': 'People & Permissions',
  '任命经理、版主，分配专属 ID。': 'Appoint managers and moderators, and assign custom IDs.',
  '公告与新闻发布': 'Announcements & News',
  '发布官方公告、更新与活动新闻。': 'Publish official announcements, updates, and event news.',
  '活动管理': 'Event Management',
  '发布活动、管理报名。': 'Publish events and manage sign-ups.',
  '招募管理': 'Recruitment Management',
  '开启/关闭招募、审核申请。': 'Open or close recruitment and review applications.',
  '举报处理': 'Report Handling',
  '处理玩家举报与申诉。': 'Handle player reports and appeals.',
  '处罚管理': 'Moderation',
  '警告、禁言、封禁与撤销。': 'Warnings, mutes, bans, and reversals.',
  '社区规则管理': 'Community Rules',
  '新增、修改与发布社区规则条款。': 'Add, edit, and publish community rule articles.',
  '操作审计': 'Audit Log',
  '查看关键操作记录（权限/车队/活动/规则）':
    'Review key actions (permissions, convoys, events, rules)',
  '系统核心设置（尚未开放）': 'Core System Settings (not available yet)',
  '预留模块：功能尚未上线，暂不可用。':
    'Reserved module: this feature is not live yet and is currently unavailable.',

  // ---------- 空状态与返回 ----------
  '当前等级暂无可用后台功能，如需权限请联系经理或高级社区经理。':
    'No admin features are available at your current level. Contact a manager or senior community manager for access.',
  '← 返回社区主页': '← Back to community home',

  // ---------- 权限提示 ----------
  '🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能访问此控制台。':
    '🚫 Insufficient permissions: only staff (Lv.40) and above can access this console.',

  // ---------- 运营概览 ----------
  '运营概览': 'Operations Overview',
  '待处理举报': 'Open reports',
  '待审核招募': 'Pending applications',
  '生效处罚': 'Active moderation',
  '即将开始活动': 'Upcoming events',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 运营概览的四项统计；null 表示加载中或查询失败（统一显示 —）。 */
type AdminStats = {
  openReports: number | null;
  pendingRecruitment: number | null;
  activeModeration: number | null;
  upcomingEvents: number | null;
};

export default function AdminDashboard() {
  const tr = useTr(EN);
  const locale = useLocale();
  const [role, setRole] = useState<string | null>(null);
  const [roleLevel, setRoleLevel] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats>({
    openReports: null,
    pendingRecruitment: null,
    activeModeration: null,
    upcomingEvents: null,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      const { data: profile } = await supabase.from('profiles').select('role, role_level').eq('id', user.id).single();

      // 判权只看 profiles.role_level，不再根据邮箱硬编码提权
      const currentLevel = levelOf(profile?.role_level);

      if (!canAccessAdmin(currentLevel)) {
        alert(tr('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能访问此控制台。'));
        router.push('/');
        return;
      }

      setRole(profile?.role ?? null);
      setRoleLevel(currentLevel);
      setLoading(false);
    };
    checkRole();
  }, [router]);

  // 运营概览：权限校验通过后才并发统计四项数据；单项失败只显示 —，不阻塞页面。
  useEffect(() => {
    if (loading || !canAccessAdmin(roleLevel)) return;

    let cancelled = false;
    const nowIso = new Date().toISOString();

    const loadStats = async () => {
      try {
        const [reports, recruitment, moderation, events] = await Promise.all([
          supabase
            .from('reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open'),
          supabase
            .from('recruitment_applications')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'reviewing']),
          supabase
            .from('moderation_actions')
            .select('id', { count: 'exact', head: true })
            .is('revoked_at', null)
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
          supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published')
            .gte('start_at', nowIso),
        ]);

        if (cancelled) return;

        if (reports.error) console.warn('统计待处理举报失败:', reports.error.message);
        if (recruitment.error) console.warn('统计待审核招募失败:', recruitment.error.message);
        if (moderation.error) console.warn('统计生效处罚失败:', moderation.error.message);
        if (events.error) console.warn('统计即将开始活动失败:', events.error.message);

        setStats({
          openReports: reports.error ? null : reports.count,
          pendingRecruitment: recruitment.error ? null : recruitment.count,
          activeModeration: moderation.error ? null : moderation.count,
          upcomingEvents: events.error ? null : events.count,
        });
        setStatsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('加载运营概览失败:', err instanceof Error ? err.message : err);
        setStatsLoading(false);
      }
    };

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [loading, roleLevel]);

  if (loading) {
    return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('验证权限中...')}</div>;
  }

  // 角色名：中文用 roleLabel（含数据库展示名），英文统一用 roleLabelEn。
  const displayRole = locale === 'en' ? roleLabelEn(role, roleLevel) : roleLabel(role, roleLevel);

  // 加载中或查询失败统一显示 —，避免误导为 0。
  const formatStat = (value: number | null): string =>
    statsLoading || value === null ? '—' : String(value);

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">{tr('🛡️ 社区控制台')}</h1>
        <p className="text-gray-500 mb-8 border-b border-gray-700 pb-4">
          {tr('当前身份：')}<span className="text-blue-400 font-bold">{displayRole} (Lv.{roleLevel})</span>
        </p>

        {/* 🌟 运营概览（Lv.40+）：四项统计并发加载，加载中/失败显示 — */}
        {canAccessAdmin(roleLevel) && (
          <section aria-labelledby="admin-overview-heading" className="mb-8">
            <h2
              id="admin-overview-heading"
              className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
            >
              {tr('运营概览')}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Link
                href="/admin/reports"
                className="block rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg transition hover:border-orange-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <p className="mb-1 text-[11px] text-gray-400">
                  <span aria-hidden="true">🚩</span> {tr('待处理举报')}
                </p>
                <p className="font-mono text-2xl font-bold text-white">{formatStat(stats.openReports)}</p>
              </Link>

              <Link
                href="/admin/recruitment"
                className="block rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg transition hover:border-green-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <p className="mb-1 text-[11px] text-gray-400">
                  <span aria-hidden="true">📢</span> {tr('待审核招募')}
                </p>
                <p className="font-mono text-2xl font-bold text-white">{formatStat(stats.pendingRecruitment)}</p>
              </Link>

              <Link
                href="/admin/moderation"
                className="block rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg transition hover:border-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <p className="mb-1 text-[11px] text-gray-400">
                  <span aria-hidden="true">⚖️</span> {tr('生效处罚')}
                </p>
                <p className="font-mono text-2xl font-bold text-white">{formatStat(stats.activeModeration)}</p>
              </Link>

              <Link
                href="/admin/events"
                className="block rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg transition hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <p className="mb-1 text-[11px] text-gray-400">
                  <span aria-hidden="true">🗓️</span> {tr('即将开始活动')}
                </p>
                <p className="font-mono text-2xl font-bold text-white">{formatStat(stats.upcomingEvents)}</p>
              </Link>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* 🌟 人员与权限管理 (Lv.70 经理及以上可见) */}
          {canManageUsers(roleLevel) && (
            <Link href="/admin/users" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-green-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">👥</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('员工与权限管理')}</h2>
              <p className="text-sm text-gray-400">{tr('任命经理、版主，分配专属 ID。')}</p>
            </Link>
          )}

          {/* 🌟 公告与新闻发布 (Lv.40 工作人员及以上可见) */}
          {canManageAnnouncements(roleLevel) && (
            <Link href="/admin/news" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📰</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('公告与新闻发布')}</h2>
              <p className="text-sm text-gray-400">{tr('发布官方公告、更新与活动新闻。')}</p>
            </Link>
          )}

          {/* 🌟 活动管理 (Lv.40 工作人员及以上可见) */}
          {canManageAnnouncements(roleLevel) && (
            <Link href="/admin/events" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-orange-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">🗓️</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('活动管理')}</h2>
              <p className="text-sm text-gray-400">{tr('发布活动、管理报名。')}</p>
            </Link>
          )}

          {/* 🌟 招募管理 (Lv.40 工作人员及以上可见) */}
          {canAccessAdmin(roleLevel) && (
            <Link href="/admin/recruitment" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-green-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📢</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('招募管理')}</h2>
              <p className="text-sm text-gray-400">{tr('开启/关闭招募、审核申请。')}</p>
            </Link>
          )}

          {/* 🌟 举报处理 (Lv.40 工作人员及以上可见) */}
          {canAccessAdmin(roleLevel) && (
            <Link href="/admin/reports" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-orange-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">🚩</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('举报处理')}</h2>
              <p className="text-sm text-gray-400">{tr('处理玩家举报与申诉。')}</p>
            </Link>
          )}

          {/* 🌟 处罚管理 (Lv.40 工作人员及以上可见) */}
          {canAccessAdmin(roleLevel) && (
            <Link href="/admin/moderation" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-red-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">⚖️</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('处罚管理')}</h2>
              <p className="text-sm text-gray-400">{tr('警告、禁言、封禁与撤销。')}</p>
            </Link>
          )}

          {/* 🌟 社区规则管理 (Lv.90 高级社区经理及以上可见) */}
          {canEditRules(roleLevel) && (
            <Link href="/admin/rules" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-purple-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📜</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('社区规则管理')}</h2>
              <p className="text-sm text-gray-400">{tr('新增、修改与发布社区规则条款。')}</p>
            </Link>
          )}

          {/* 🌟 操作审计 (Lv.90 高级社区经理及以上可见) */}
          {canEditRules(roleLevel) && (
            <Link href="/admin/audit" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-orange-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">🛡️</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('操作审计')}</h2>
              <p className="text-sm text-gray-400">{tr('查看关键操作记录（权限/车队/活动/规则）')}</p>
            </Link>
          )}

          {/* 🌟 系统设置占位 (Lv.90 及以上可见)：保留模块位置，但明确标注尚未开放 */}
          {canEditRules(roleLevel) && (
            <div
              aria-disabled="true"
              className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 opacity-70 cursor-not-allowed shadow-lg"
            >
              <div className="text-4xl mb-4">⚙️</div>
              <h2 className="text-xl font-bold text-white mb-2">{tr('系统核心设置（尚未开放）')}</h2>
              <p className="text-sm text-gray-400">{tr('预留模块：功能尚未上线，暂不可用。')}</p>
            </div>
          )}

        </div>

        {!canManageUsers(roleLevel) && !canManageAnnouncements(roleLevel) && !canEditRules(roleLevel) && (
          <p className="text-sm text-gray-500 mt-6">{tr('当前等级暂无可用后台功能，如需权限请联系经理或高级社区经理。')}</p>
        )}
        
        <div className="mt-12 border-t border-gray-700 pt-6">
          <Link href="/" className="text-blue-400 hover:text-white transition text-sm">
            {tr('← 返回社区主页')}
          </Link>
        </div>

      </div>
    </main>
  );
}
