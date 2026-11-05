'use client';

import { useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { useTr, useLocale } from '@/components/I18nProvider';
import { canAccessAdmin, levelOf, roleColor, roleLabel, roleLabelEn } from '@/lib/permissions';
import type { Locale } from '@/lib/i18n';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 车队职位展示标签（manager 为历史数据兼容）
const VTC_ROLE_LABELS: Record<string, string> = {
  owner: '队长',
  vice_owner: '副队长',
  dispatcher: '调度员',
  member: '车手',
  manager: '经理',
};

const VTC_ROLE_LABELS_EN: Record<string, string> = {
  owner: 'Leader',
  vice_owner: 'Deputy Leader',
  dispatcher: 'Dispatcher',
  member: 'Driver',
  manager: 'Manager',
};

function vtcRoleLabel(role: string | null | undefined, locale: Locale): string {
  const key = role?.trim();
  if (!key) return locale === 'en' ? 'Driver' : '车手';
  const labels = locale === 'en' ? VTC_ROLE_LABELS_EN : VTC_ROLE_LABELS;
  return labels[key] ?? (locale === 'en' ? roleLabelEn(key, 0) : key);
}

/** 页面文案：中文原文为 key，英文缺失时回退中文。 */
const EN: Record<string, string> = {
  // 通用状态
  '加载中...': 'Loading...',
  '玩家': 'Player',
  '分配中...': 'Assigning...',
  '未绑定': 'Not linked',
  '未入服': 'Not in server',

  // 左侧边栏
  '个人资料': 'Profile',
  '账号设置': 'Account Settings',
  '管理员特权': 'Admin Access',
  '进入管理后台': 'Open Admin Panel',

  // 玩家信息
  '关于我 (Bio)': 'About Me (Bio)',
  'Active (正常)': 'Active',
  '前往频道': 'Visit Channel',
  '前往主页': 'Visit Page',
  '前往资料': 'View Profile',

  // 游戏内遥测
  'In-Game Telemetry (游戏遥测)': 'In-Game Telemetry',
  '数据接入中': 'Telemetry connected',
  '当前速度': 'Current Speed',
  '档位': 'Gear',
  '油量': 'Fuel',
  '引擎状态': 'Engine',
  '关闭': 'Off',

  // 车队信息
  'VTC Info (车队信息)': 'VTC Info',
  '你目前尚未加入任何车队 (You are not currently a member of any VTC).':
    'You are not currently a member of any VTC.',

  // 运输记录
  'Deliveries (运输记录)': 'Deliveries',
  '暂无运输记录 (No deliveries found).': 'No deliveries found.',

  // 成就与勋章
  '成就与勋章 (Achievements)': 'Achievements',
  '正版认证': 'Verified Copy',
  '已绑定 Steam': 'Steam linked',
  '初来乍到': 'Newcomer',
  '发布首个话题': 'Posted first topic',
  '活跃司机': 'Active Driver',
  '回复满 50 次': 'Reached 50 replies',
  '元老': 'Veteran',
  '拥有专属靓号': 'Owns a custom ID',

  // 我的社区动态
  '我的社区动态': 'My Community Activity',
  '共发布 {topics} 个话题，回复 {replies} 次': '{topics} topics posted · {replies} replies',
  '你还没有在论坛发布过帖子。': "You haven't posted in the forum yet.",
};

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  role_level: number | null;
  vtc_id: number | null;
  vtc_role: string | null;
  custom_id: string | null;
  random_id: string | null;
  languages: string | null;
  steam_id: string | null;
  bio: string | null;
  discord_id: string | null;
  twitch_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  wot_url: string | null;
}

interface VtcInfo {
  name: string | null;
  tag: string | null;
  logo_url: string | null;
}

interface TopicRow {
  id: number;
  title: string | null;
  category_id: number | null;
  created_at: string;
}

type ProfileWithVtc = ProfileRow & { vtc_info: VtcInfo | null };

interface ProfileRoleRow {
  role: string;
  level: number;
}

interface RoleMetaRow {
  name: string;
  display_name: string | null;
}

interface RoleBadge {
  key: string;
  label: string;
  level: number;
  color: string;
  primary: boolean;
}

/** 数据库一个账号最多 4 个职位，前端再兜一层。 */
const MAX_PROFILE_ROLES = 4;

/** 只保留合法的 profile_roles 行，接口异常时不至于渲染出错。 */
function toProfileRoleRows(data: unknown): ProfileRoleRow[] {
  if (!Array.isArray(data)) return [];
  const rows: ProfileRoleRow[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const role = typeof row.role === 'string' ? row.role.trim() : '';
    if (!role) continue;
    rows.push({ role, level: typeof row.level === 'number' ? row.level : 0 });
  }
  return rows;
}

/** roles 表的展示名，形如「社区版主 (Community Moderator)」。 */
function toRoleMetaRows(data: unknown): RoleMetaRow[] {
  if (!Array.isArray(data)) return [];
  const rows: RoleMetaRow[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()) continue;
    rows.push({
      name: row.name.trim(),
      display_name: typeof row.display_name === 'string' ? row.display_name : null,
    });
  }
  return rows;
}

/** "社区版主 (Community Moderator)" -> { zh, en }；没有括号时 en 为空。 */
function splitRoleDisplayName(displayName: string): { zh: string; en: string } {
  const matched = displayName.match(/^(.+?)\s*\(([^()]*)\)\s*$/);
  if (matched) {
    const zh = matched[1]?.trim() ?? '';
    const en = matched[2]?.trim() ?? '';
    if (zh && en) return { zh, en };
  }
  return { zh: displayName.trim(), en: '' };
}

/**
 * 多职位徽章：profile_roles 按 level 降序取最多 4 个，主职位排在最前；
 * 没有记录时回退 profiles.role / role_level；颜色统一走 roleColor。
 * 中文名优先 roles.display_name 的中文部分，英文名用其英文部分，缺失时回退 roleLabel / roleLabelEn。
 */
function buildRoleBadges(
  roleRows: readonly ProfileRoleRow[],
  roleMeta: readonly RoleMetaRow[],
  fallbackRole: string | null | undefined,
  fallbackLevel: number | null | undefined,
  locale: Locale
): RoleBadge[] {
  const metaByName = new Map<string, string>();
  for (const row of roleMeta) {
    if (row.display_name) metaByName.set(row.name, row.display_name);
  }

  const seen = new Set<string>();
  const picked: ProfileRoleRow[] = [];
  for (const row of [...roleRows].sort((a, b) => b.level - a.level)) {
    if (seen.has(row.role)) continue;
    seen.add(row.role);
    picked.push(row);
    if (picked.length >= MAX_PROFILE_ROLES) break;
  }

  if (picked.length === 0) {
    picked.push({ role: fallbackRole?.trim() || 'member', level: levelOf(fallbackLevel) });
  }

  return picked.map((row, index) => {
    const displayName = metaByName.get(row.role);
    let label = locale === 'en' ? roleLabelEn(row.role, row.level) : roleLabel(row.role, row.level);
    if (displayName) {
      const parts = splitRoleDisplayName(displayName);
      const localized = locale === 'en' ? parts.en : parts.zh;
      if (localized) label = localized;
    }
    return {
      key: row.role,
      label,
      level: row.level,
      color: roleColor(row.role, row.level),
      primary: index === 0,
    };
  });
}

function RoleBadgePill({ badge }: { badge: RoleBadge }) {
  return (
    <span
      title={badge.level > 0 ? `Lv.${badge.level}` : undefined}
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${
        badge.primary ? 'font-bold' : 'font-medium'
      }`}
      style={{
        borderColor: `${badge.color}66`,
        backgroundColor: `${badge.color}1a`,
        color: badge.color,
      }}
    >
      {badge.label}
    </span>
  );
}

function RoleBadgeList({ badges, className }: { badges: RoleBadge[]; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {badges.map((badge) => (
        <RoleBadgePill key={badge.key} badge={badge} />
      ))}
    </span>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileWithVtc | null>(null);
  const [loading, setLoading] = useState(true);

  // 多职位：profile_roles 的全部职位 + roles 表的双语展示名
  const [profileRoleRows, setProfileRoleRows] = useState<ProfileRoleRow[]>([]);
  const [roleMetaRows, setRoleMetaRows] = useState<RoleMetaRow[]>([]);
  
  // 我的话题状态和回复数量
  const [myTopics, setMyTopics] = useState<TopicRow[]>([]);
  const [myRepliesCount, setMyRepliesCount] = useState(0);
  const [discordAccount, setDiscordAccount] = useState<{
    username: string;
    global_name: string | null;
    guild_member: boolean;
  } | null>(null);
  
  const router = useRouter();
  const tr = useTr(EN);
  const locale = useLocale();

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (profileData) {
        let vtcInfo = null;
        if (profileData.vtc_id) {
          const { data: vtcData, error: vtcError } = await supabase
            .from('vtcs')
            .select('name, tag, logo_url')
            .eq('id', profileData.vtc_id)
            .single();

          if (vtcError) {
            console.error('获取车队信息失败:', vtcError);
          } else {
            vtcInfo = vtcData;
          }
        }

        setProfile({ ...profileData, vtc_info: vtcInfo });
      }

      // 多职位：一个账号最多 4 个职位，公开可读；没有记录时由 buildRoleBadges 回退 profile.role。
      const [profileRolesResult, rolesMetaResult] = await Promise.all([
        supabase
          .from('profile_roles')
          .select('role, level')
          .eq('user_id', user.id)
          .order('level', { ascending: false }),
        supabase.from('roles').select('name, display_name'),
      ]);

      if (profileRolesResult.error) {
        console.error('获取多职位失败:', profileRolesResult.error);
      } else {
        setProfileRoleRows(toProfileRoleRows(profileRolesResult.data));
      }
      if (rolesMetaResult.error) {
        console.error('获取职位名称失败:', rolesMetaResult.error);
      } else {
        setRoleMetaRows(toRoleMetaRows(rolesMetaResult.data));
      }

      // Discord 绑定状态（RLS 允许读取自己的绑定）
      const { data: discordData } = await supabase
        .from('discord_accounts')
        .select('username, global_name, guild_member')
        .eq('user_id', user.id)
        .maybeSingle();
      if (discordData) setDiscordAccount(discordData);

      // 获取我发布的最新 5 个话题
      const { data: topicsData } = await supabase
        .from('forum_topics')
        .select('id, title, category_id, created_at, replies_count')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (topicsData) setMyTopics(topicsData);

      // 获取我回复的总数
      const { count } = await supabase
        .from('forum_replies')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', user.id);
      
      if (count) setMyRepliesCount(count);

      setLoading(false);
    };
    loadData();
  }, [router]);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('加载中...')}</div>;

  const displayName = profile?.display_name || user?.email?.split('@')[0] || tr('玩家');
  const avatarUrl = profile?.avatar_url;
  
  // 角色判断体系：判权只看 role_level，role 仅用于展示
  const userRole = profile?.role || 'member';
  const userLevel = levelOf(profile?.role_level);
  const roleBadges = buildRoleBadges(
    profileRoleRows,
    roleMetaRows,
    profile?.role,
    profile?.role_level,
    locale
  );
  const showAdminEntry = canAccessAdmin(userLevel);
  // 身份展示配色：与数据库 roles.color / Discord 身份组保持一致。
  const roleAccent = roleColor(userRole, userLevel);

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* 左侧边栏 */}
          <div className="space-y-4">
            <div className="bg-[#2c2d31] rounded-md overflow-hidden border border-gray-700 shadow-lg">
              <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=600&auto=format&fit=crop')` }}></div>
              <div className="p-4 relative">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white border-4 border-[#2c2d31] absolute -top-8 shadow-md overflow-hidden">
                  {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
                </div>
                <div className="mt-8">
                  <h2 className="text-white font-bold text-lg">{displayName}</h2>
                  <RoleBadgeList badges={roleBadges} className="mt-2" />
                </div>
              </div>
            </div>

            <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-2 shadow-lg">
              <ul className="text-sm space-y-1">
                <li>
                  <Link href="/profile" className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    {tr('个人资料')}
                  </Link>
                </li>
                <li>
                  <Link href="/settings" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                    {tr('账号设置')}
                  </Link>
                </li>
              </ul>
            </div>

            {showAdminEntry && (
              <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-4 shadow-lg">
                <h3 className="text-xs text-gray-500 font-bold mb-3 uppercase tracking-wider">{tr('管理员特权')}</h3>
                <Link href="/admin" className="bg-blue-600 hover:bg-blue-700 text-white text-center w-full block py-2 rounded-md text-sm font-bold transition shadow">
                  {tr('进入管理后台')}
                </Link>
              </div>
            )}
          </div>

          {/* 右侧主内容区 */}
          <div className="lg:col-span-3 space-y-6">
            
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">Player Info</span>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <h1 className="text-2xl font-bold" style={{ color: roleAccent }}>{displayName}</h1>
                    <span className="bg-[#1e1f23] text-gray-400 text-xs px-2 py-1 rounded border border-gray-700 font-mono">
                      ID: {profile?.custom_id || profile?.random_id || tr('分配中...')}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-3">
                    <p><span className="text-gray-500 inline-block w-28">Languages:</span> <span className="text-white">{profile?.languages || 'Chinese (Simplified)'}</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Steam ID:</span> <span className="text-white">{profile?.steam_id || tr('未绑定')}</span></p>
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 inline-block w-28 shrink-0">Role:</span>
                      <RoleBadgeList badges={roleBadges} />
                    </div>
                    <p><span className="text-gray-500 inline-block w-28">Active bans:</span> <span className="text-white">0</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Linked games:</span> <span className="text-white">Euro Truck Simulator 2</span></p>
                    <p><span className="text-gray-500 inline-block w-28">In-game status:</span> <span className="text-gray-500">Offline</span></p>
                    
                    {profile?.bio && (
                      <div className="mt-4 p-3 bg-[#232428] rounded border border-gray-700">
                        <p className="text-gray-400 text-xs mb-1">{tr('关于我 (Bio)')}</p>
                        <p className="text-white text-sm">{profile.bio}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-[#232428] p-3 rounded-md border border-gray-700">
                     <h4 className="text-xs text-gray-400 mb-1">Account Status</h4>
                     <p className="text-green-500 font-bold text-sm">{tr('Active (正常)')}</p>
                  </div>
                  
                  {/* 🌟 干净整洁的社交信息框 */}
                  <div className="bg-[#232428] p-4 rounded-md border border-gray-700">
                     <h4 className="text-xs text-gray-400 mb-3 font-bold">Social Information</h4>
                     <div className="space-y-2 text-sm">
                        <p className="text-gray-400 flex justify-between">
                          <span>Discord:</span> 
                          {discordAccount ? (
                            <span className="text-white text-right">
                              {discordAccount.global_name || discordAccount.username}
                              {!discordAccount.guild_member && (
                                <span className="ml-1 text-[11px] text-amber-400">
                                  {tr('未入服')}
                                </span>
                              )}
                            </span>
                          ) : (
                            <Link href="/settings" className="text-blue-400 hover:underline">
                              {tr('未绑定')} →
                            </Link>
                          )}
                        </p>
                        <p className="text-gray-400 flex justify-between">
                          <span>Steam:</span> 
                          <span className="text-white">{profile?.steam_id || tr('未绑定')}</span>
                        </p>
                        
                        {profile?.twitch_url && (
                          <p className="text-gray-400 flex justify-between">
                            <span>Twitch:</span> 
                            <a href={profile.twitch_url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">{tr('前往频道')}</a>
                          </p>
                        )}
                        {profile?.twitter_url && (
                          <p className="text-gray-400 flex justify-between">
                            <span>Twitter:</span> 
                            <a href={profile.twitter_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{tr('前往主页')}</a>
                          </p>
                        )}
                        {profile?.youtube_url && (
                          <p className="text-gray-400 flex justify-between">
                            <span>YouTube:</span> 
                            <a href={profile.youtube_url} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">{tr('前往频道')}</a>
                          </p>
                        )}
                        {profile?.wot_url && (
                          <p className="text-gray-400 flex justify-between">
                            <span>World of Trucks:</span> 
                            <a href={profile.wot_url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">{tr('前往资料')}</a>
                          </p>
                        )}
                     </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('VTC Info (车队信息)')}</span>
              </div>
              <div className="p-6">
                {profile?.vtc_info ? (
                  <Link href={`/vtc/${profile.vtc_id}`} className="flex items-center gap-4 bg-[#232428] p-4 rounded-lg border border-gray-700 hover:border-blue-500 transition group">
                    <div className="w-16 h-16 bg-[#18191c] rounded-lg overflow-hidden border border-gray-600 flex items-center justify-center shrink-0">
                      {profile.vtc_info.logo_url ? (
                        <img src={profile.vtc_info.logo_url} alt={profile.vtc_info.name ?? ''} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🏢</span>
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{profile.vtc_info.name}</h3>
                        {profile.vtc_info.tag && <span className="text-xs text-blue-400 font-mono">[{profile.vtc_info.tag}]</span>}
                        <span className="text-[10px] font-bold text-blue-300 bg-blue-900/40 border border-blue-800 px-2 py-0.5 rounded">
                          {vtcRoleLabel(profile.vtc_role as string | null | undefined, locale)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="text-center text-gray-500 text-sm py-8 bg-[#232428] rounded-md border border-dashed border-gray-700">
                    {tr('你目前尚未加入任何车队 (You are not currently a member of any VTC).')}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('Deliveries (运输记录)')}</span>
              </div>
              <div className="p-6">
                <div className="text-center text-gray-500 text-sm py-8 bg-[#232428] rounded-md border border-dashed border-gray-700">
                  {tr('暂无运输记录 (No deliveries found).')}
                </div>
              </div>
            </div>

            {/* 🌟 论坛成就系统 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('成就与勋章 (Achievements)')}</span>
              </div>
              <div className="p-6 flex flex-wrap gap-4">
                <div className="bg-[#18191c] border border-green-500/50 p-4 rounded-lg text-center w-28 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                  <div className="text-3xl mb-2">🚛</div>
                  <p className="text-xs text-white font-bold">{tr('正版认证')}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{tr('已绑定 Steam')}</p>
                </div>
                <div className="bg-[#18191c] border border-blue-500/50 p-4 rounded-lg text-center w-28 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                  <div className="text-3xl mb-2">📝</div>
                  <p className="text-xs text-white font-bold">{tr('初来乍到')}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{tr('发布首个话题')}</p>
                </div>
                <div className="bg-[#18191c] border border-gray-700 p-4 rounded-lg text-center w-28 opacity-50 grayscale">
                  <div className="text-3xl mb-2">🔥</div>
                  <p className="text-xs text-white font-bold">{tr('活跃司机')}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{tr('回复满 50 次')}</p>
                </div>
                <div className="bg-[#18191c] border border-gray-700 p-4 rounded-lg text-center w-28 opacity-50 grayscale">
                  <div className="text-3xl mb-2">👑</div>
                  <p className="text-xs text-white font-bold">{tr('元老')}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{tr('拥有专属靓号')}</p>
                </div>
              </div>
            </div>

            {/* 🌟 我的论坛动态 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                  <span className="text-sm font-bold text-gray-400">{tr('我的社区动态')}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {tr('共发布 {topics} 个话题，回复 {replies} 次', {
                    topics: myTopics.length,
                    replies: myRepliesCount,
                  })}
                </span>
              </div>
              
              <div className="p-4 space-y-2">
                {myTopics.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">{tr('你还没有在论坛发布过帖子。')}</p>
                ) : (
                  myTopics.map(topic => (
                    <Link 
                      key={topic.id}
                      href={`/forum/${topic.category_id}/${topic.id}`}
                      className="block bg-[#18191c] p-3 rounded-md border border-gray-700 hover:border-blue-500 transition"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-sm truncate pr-4">{topic.title}</span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(topic.created_at).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}