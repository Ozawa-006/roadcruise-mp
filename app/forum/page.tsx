// app/forum/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { useLocale, useTr } from '@/components/I18nProvider';
import type { Locale } from '@/lib/i18n';
import { roleLabelEn } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 英文文案表（以中文原文为 key）：只覆盖静态 UI 文案。
 * 版块名 / 版块简介 / 昵称 / 职位名来自数据库，保持原样不翻译。
 */
const EN: Record<string, string> = {
  // ---- 页面状态 ----
  '加载论坛数据中...': 'Loading forum data...',

  // ---- 左侧导航栏 ----
  '导航': 'Navigation',
  '论坛首页': 'Forum Home',
  '实时地图': 'Live Map',
  '社区规则': 'Community Rules',
  '招募 (Recruitment)': 'Recruitment',
  'VTC 车队系统': 'VTC System',

  // ---- 页头 ----
  'CRT MP 论坛': 'CRT MP Forum',
  '加入讨论，分享你的卡车生活。': 'Join the discussion and share your trucking life.',
  '发布新帖': 'New Post',

  // ---- 官方公告版块卡片（category_id = 1，只读展示 announcements） ----
  '只读': 'Read-only',
  '后台发布的官方公告，版块内只读':
    'Official announcements published from the admin console (read-only)',
  '{n} 条公告': '{n} announcements',

  // ---- 当前在线成员 ----
  '当前在线成员': 'Online Now',

  // ---- 最新动态 ----
  '最新动态': 'Latest Activity',
  '暂无动态': 'No activity yet',
  '未知': 'Unknown',

  // ---- 团队职位变更 ----
  '团队职位变更': 'Team Role Changes',
  // 中文标题后自带英文副标题，英文界面下标题已含 Team，副标题留空避免重复。
  '/ Team Changes': '',
  '查看团队 →': 'View team →',
  '加载中…': 'Loading…',
  '职位变更加载失败，请稍后重试': 'Failed to load role changes. Please try again later.',
  '暂无职位变更记录': 'No role changes yet',
  '未知成员': 'Unknown member',
  '加入': 'Joined',
  '晋升': 'Promoted',
  '降职': 'Demoted',
  '实习': 'Trainee',
  '职位变更': 'Role change',

  // ---- 热门主题 ----
  '热门主题': 'Hot Topics',
  '暂无热门': 'Nothing trending yet',
  '{n} 回复': '{n} replies',

  // ---- 最近注册成员 ----
  '最近注册成员': 'Newest Members',
};

/** team_changes 公开行，profiles 为 user_id 外键的单条嵌入（删除用户时可能为 null）。 */
interface TeamChangeRow {
  id: number;
  old_role: string | null;
  new_role: string | null;
  change_type: string | null;
  created_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
}

interface RoleNameRow {
  name: string;
  display_name: string | null;
}

interface ChangeTypeMeta {
  label: string;
  className: string;
}

/** 变更类型徽章：join=加入/绿、promotion=晋升/蓝、demotion=降职/橙、trainee=实习/紫、role_change=职位变更/灰。 */
const CHANGE_TYPE_META: Record<string, ChangeTypeMeta | undefined> = {
  join: { label: '加入', className: 'border-green-500/40 bg-green-500/10 text-green-300' },
  promotion: { label: '晋升', className: 'border-blue-500/40 bg-blue-500/10 text-blue-300' },
  demotion: { label: '降职', className: 'border-orange-500/40 bg-orange-500/10 text-orange-300' },
  trainee: { label: '实习', className: 'border-purple-500/40 bg-purple-500/10 text-purple-300' },
  role_change: { label: '职位变更', className: 'border-gray-600 bg-gray-500/10 text-gray-300' },
};

const DEFAULT_CHANGE_TYPE_META: ChangeTypeMeta = {
  label: '职位变更',
  className: 'border-gray-600 bg-gray-500/10 text-gray-300',
};

/** 版块行（forum_categories）；name_en / description_en 为空时回退中文。 */
interface ForumCategoryRow {
  id: number;
  name: string | null;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  icon: string | null;
}

/** 侧栏帖子摘要行（PostgREST 多对一嵌入既可能返回对象也可能返回数组）。 */
type TopicProfiles = { display_name: string | null } | { display_name: string | null }[] | null;

interface LatestTopicRow {
  id: number;
  title: string;
  title_en: string | null;
  created_at: string;
  category_id: number;
  profiles?: TopicProfiles;
}

interface HotTopicRow {
  id: number;
  title: string;
  title_en: string | null;
  replies_count: number | null;
  category_id: number;
  profiles?: TopicProfiles;
}

/** 统一取嵌入作者昵称：数组取第一条，缺失返回 null。 */
function authorNameOf(profiles: TopicProfiles | undefined): string | null {
  if (!profiles) return null;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.display_name ?? null;
}

/** 双语字段取值：英文界面且英文字段非空时用英文，否则回退中文。 */
function localizedText(
  locale: Locale,
  en: string | null | undefined,
  zh: string | null | undefined
): string {
  const english = en?.trim();
  if (locale === 'en' && english) return english;
  return zh ?? '';
}

/** 在线成员行（profiles） */
interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

function changeTypeMetaOf(changeType: string | null): ChangeTypeMeta {
  return (changeType ? CHANGE_TYPE_META[changeType] : undefined) ?? DEFAULT_CHANGE_TYPE_META;
}

function teamMemberNameOf(change: TeamChangeRow, fallback: string): string {
  const embedded = change.profiles;
  const profile = Array.isArray(embedded) ? embedded[0] : embedded;
  const name = profile?.display_name?.trim();
  return name || fallback;
}

/** 职位徽章：英文模式统一走 roleLabelEn，中文模式用 roles.display_name；职位为空显示「—」。 */
function roleLabelOf(
  role: string | null,
  roleNames: Record<string, string>,
  locale: Locale
): string {
  const name = role?.trim();
  if (!name) return '—';
  if (locale === 'en') return roleLabelEn(name, 0);
  return roleNames[name]?.trim() || name;
}

function formatChangeTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN');
}

export default function ForumHome() {
  const tr = useTr(EN);
  const locale = useLocale();
  const [categories, setCategories] = useState<ForumCategoryRow[]>([]);
  const [latestTopics, setLatestTopics] = useState<LatestTopicRow[]>([]);
  const [hotTopics, setHotTopics] = useState<HotTopicRow[]>([]);
  const [recentUsers, setRecentUsers] = useState<ProfileRow[]>([]);
  const [teamChanges, setTeamChanges] = useState<TeamChangeRow[]>([]);
  const [roleNames, setRoleNames] = useState<Record<string, string>>({});
  // 官方公告版块只展示 announcements，这里取总数用于版块卡片提示（可为空）。
  const [announcementCount, setAnnouncementCount] = useState<number | null>(null);
  const [teamChangesLoading, setTeamChangesLoading] = useState(true);
  const [teamChangesFailed, setTeamChangesFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForumData = async () => {
      // 1. 获取版块（含英文字段，英文界面优先显示）
      const { data: catData } = await supabase
        .from('forum_categories')
        .select('id, name, name_en, description, description_en, icon')
        .order('id');
      if (catData) setCategories(catData);

      // 1.1 官方公告版块（category_id = 1）现在展示 announcements，取总数用于卡片提示。
      const { count: announcementTotal } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true });
      if (announcementTotal !== null) setAnnouncementCount(announcementTotal);

      // 2. 获取最新动态（全站最新5条帖子）
      // 官方公告版块（category_id = 1）已改为只读展示 announcements，旧公告帖不再出现在这里。
      const { data: latest } = await supabase
        .from('forum_topics')
        .select(`
          id, title, title_en, created_at, category_id,
          profiles:author_id (display_name)
        `)
        .neq('category_id', 1)
        .order('created_at', { ascending: false })
        .limit(5);
      if (latest) setLatestTopics(latest);

      // 3. 获取热门主题（按回复数最多排序前5条）
      // 同样排除官方公告版块的旧帖，避免链回 /forum/1/{id}。
      const { data: hot } = await supabase
        .from('forum_topics')
        .select(`
          id, title, title_en, replies_count, category_id,
          profiles:author_id (display_name)
        `)
        .neq('category_id', 1)
        .order('replies_count', { ascending: false })
        .limit(5);
      if (hot) setHotTopics(hot);

      // 🌟 4. 获取“在线”成员（修改：拉取最近活跃的 32 位用户）
      const { data: users } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .order('updated_at', { ascending: false })
        .limit(32); // 改为 32，这样人多时能铺满好几行
      if (users) setRecentUsers(users);

      setLoading(false);
    };
    fetchForumData();
  }, []);

  // 团队职位变更：独立加载，失败只影响本卡片，不阻断整页。
  useEffect(() => {
    let cancelled = false;

    const fetchTeamChanges = async () => {
      try {
        const [changesResult, rolesResult] = await Promise.all([
          supabase
            .from('team_changes')
            .select('id, old_role, new_role, change_type, created_at, profiles!user_id(display_name)')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(8),
          supabase.from('roles').select('name, display_name'),
        ]);

        if (cancelled) return;

        if (changesResult.error) {
          setTeamChanges([]);
          setTeamChangesFailed(true);
          return;
        }

        setTeamChanges((changesResult.data ?? []) as unknown as TeamChangeRow[]);

        if (!rolesResult.error && rolesResult.data) {
          const nextRoleNames: Record<string, string> = {};
          for (const role of rolesResult.data as unknown as RoleNameRow[]) {
            if (role.name && role.display_name) nextRoleNames[role.name] = role.display_name;
          }
          setRoleNames(nextRoleNames);
        }
      } catch {
        if (!cancelled) {
          setTeamChanges([]);
          setTeamChangesFailed(true);
        }
      } finally {
        if (!cancelled) setTeamChangesLoading(false);
      }
    };

    void fetchTeamChanges();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('加载论坛数据中...')}</div>;

  // 官方公告版块（id=1）为后台公告只读展示，首页「发布新帖」改指向第一个普通版块。
  const defaultPostCategoryId = categories.find((cat) => cat.id !== 1)?.id ?? null;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* ================= 左侧栏 (导航) ================= */}
          <div className="lg:col-span-2 space-y-6 hidden lg:block">
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-2 shadow-lg">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2 mt-1">{tr('导航')}</h3>
              <ul className="text-sm space-y-1">
                <li>
                  <Link href="/forum" className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
                    {tr('论坛首页')}
                  </Link>
                </li>
                <li>
                  <Link href="/map" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" /></svg>
                    {tr('实时地图')}
                  </Link>
                </li>
                <li>
                  <Link href="/rules" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                    {tr('社区规则')}
                  </Link>
                </li>
                <li>
                  <Link href="/recruitment" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                    {tr('招募 (Recruitment)')}
                  </Link>
                </li>
                <li>
                  <Link href="/vtc" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>
                    {tr('VTC 车队系统')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* ================= 中间栏 (版块与在线成员) ================= */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* 版块列表 */}
            <div>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-1">{tr('CRT MP 论坛')}</h1>
                  <p className="text-gray-500 text-xs">{tr('加入讨论，分享你的卡车生活。')}</p>
                </div>
                {defaultPostCategoryId !== null && (
                  <Link href={`/forum/${defaultPostCategoryId}/new`} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded text-sm font-bold transition shadow-lg flex items-center gap-2">
                    <span>+</span> {tr('发布新帖')}
                  </Link>
                )}
              </div>

              <div className="space-y-3">
                {categories.map((cat) => {
                  const isOfficialBoard = cat.id === 1;
                  return (
                    <Link
                      key={cat.id}
                      href={`/forum/${cat.id}`}
                      className="block bg-[#2c2d31] border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition group shadow-lg"
                    >
                      <div className="flex items-center p-5">
                        <div className="w-12 h-12 bg-[#1e1f23] rounded-full flex items-center justify-center text-2xl mr-5 text-blue-500 group-hover:scale-110 transition shadow-inner">
                          {cat.icon === 'megaphone' ? '📢' : cat.icon === 'help' ? '🆘' : '💬'}
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{localizedText(locale, cat.name_en, cat.name)}</h2>
                            {isOfficialBoard && (
                              <span className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                                {tr('只读')}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-xs mt-1">{localizedText(locale, cat.description_en, cat.description)}</p>
                          {isOfficialBoard && (
                            <p className="text-[11px] text-blue-400/80 mt-1">
                              {tr('后台发布的官方公告，版块内只读')}
                              {announcementCount !== null ? ` · ${tr('{n} 条公告', { n: announcementCount })}` : ''}
                            </p>
                          )}
                        </div>
                        <span className="ml-4 shrink-0 text-gray-600 group-hover:text-blue-400 transition" aria-hidden="true">
                          →
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 当前在线成员 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-sm font-bold text-gray-400">{tr('当前在线成员')}</span>
              </div>
              {/* 🌟 优化排版：手机上 4 列，平板 6 列，大屏 8 列；增加上下行间距 */}
              <div className="p-4 grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-6 gap-x-4">
                {recentUsers.map(u => (
                  <Link href={`/profile/${u.id}`} key={u.id} className="flex flex-col items-center group cursor-pointer">
                    <div className="w-12 h-12 rounded bg-[#18191c] border border-gray-600 overflow-hidden group-hover:border-blue-500 transition shadow">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-500">
                          {u.display_name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-2 text-center truncate w-full group-hover:text-white transition">
                      {u.display_name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

          </div>

          {/* ================= 右侧栏 (最新动态、热门主题) ================= */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* 最新动态 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('最新动态')}</span>
              </div>
              <div className="p-2">
                {latestTopics.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-4">{tr('暂无动态')}</p>
                ) : (
                  latestTopics.map(topic => (
                    <Link key={topic.id} href={`/forum/${topic.category_id}/${topic.id}`} className="block p-2 hover:bg-[#3a3b40] rounded transition border-b border-gray-700/50 last:border-0 group">
                      <p className="text-xs text-white group-hover:text-blue-400 font-bold truncate">{localizedText(locale, topic.title_en, topic.title)}</p>
                      <p className="text-[10px] text-gray-500 mt-1 flex justify-between">
                        <span>{authorNameOf(topic.profiles) || tr('未知')}</span>
                        <span>{new Date(topic.created_at).toLocaleDateString()}</span>
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* 团队职位变更 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center justify-between gap-2 rounded-t-md">
                <div className="flex min-w-0 items-center gap-2">
                  <svg className="w-4 h-4 shrink-0 text-purple-400" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                  <span className="text-xs font-bold leading-snug text-gray-400">
                    {tr('团队职位变更')} <span className="text-gray-600">{tr('/ Team Changes')}</span>
                  </span>
                </div>
                <Link href="/team" className="shrink-0 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition">
                  {tr('查看团队 →')}
                </Link>
              </div>
              <div className="p-2">
                {teamChangesLoading ? (
                  <p className="text-center text-xs text-gray-500 py-4">{tr('加载中…')}</p>
                ) : teamChangesFailed ? (
                  <p className="text-center text-xs text-gray-500 py-4">{tr('职位变更加载失败，请稍后重试')}</p>
                ) : teamChanges.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-4">{tr('暂无职位变更记录')}</p>
                ) : (
                  <ul>
                    {teamChanges.map((change) => {
                      const badge = changeTypeMetaOf(change.change_type);
                      const oldRoleLabel = roleLabelOf(change.old_role, roleNames, locale);
                      const newRoleLabel = roleLabelOf(change.new_role, roleNames, locale);
                      return (
                        <li key={change.id} className="p-2 border-b border-gray-700/50 last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-xs font-bold text-white">{teamMemberNameOf(change, tr('未知成员'))}</span>
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{tr(badge.label)}</span>
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-[11px]">
                            <span className="min-w-0 truncate text-gray-500" title={oldRoleLabel}>{oldRoleLabel}</span>
                            <span className="shrink-0 text-gray-600">→</span>
                            <span className="min-w-0 truncate font-bold text-gray-300" title={newRoleLabel}>{newRoleLabel}</span>
                          </p>
                          <time dateTime={change.created_at} className="mt-1 block text-[10px] text-gray-500">
                            {formatChangeTime(change.created_at)}
                          </time>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* 热门主题 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('热门主题')}</span>
              </div>
              <div className="p-2">
                {hotTopics.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-4">{tr('暂无热门')}</p>
                ) : (
                  hotTopics.map((topic, index) => (
                    <Link key={topic.id} href={`/forum/${topic.category_id}/${topic.id}`} className="flex items-start gap-3 p-2 hover:bg-[#3a3b40] rounded transition border-b border-gray-700/50 last:border-0 group">
                      <span className={`text-lg font-black italic ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-orange-600' : 'text-gray-700'}`}>
                        #{index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white group-hover:text-blue-400 font-bold truncate">{localizedText(locale, topic.title_en, topic.title)}</p>
                        <p className="text-[10px] text-gray-500 mt-1 flex justify-between">
                          <span>{authorNameOf(topic.profiles) || tr('未知')}</span>
                          <span>{tr('{n} 回复', { n: topic.replies_count || 0 })}</span>
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* 最近注册成员 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('最近注册成员')}</span>
              </div>
              <div className="p-2">
                {recentUsers.slice(0, 5).map(u => (
                  <Link href={`/profile/${u.id}`} key={u.id} className="flex items-center gap-3 p-2 hover:bg-[#3a3b40] rounded transition border-b border-gray-700/50 last:border-0 block">
                    <div className="w-8 h-8 rounded-full bg-[#18191c] border border-gray-600 overflow-hidden">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                          {u.display_name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 truncate">{u.display_name}</span>
                  </Link>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </main>
  );
}