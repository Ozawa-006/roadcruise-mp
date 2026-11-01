// app/admin/users/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ROLE_LABELS,
  ROLE_LEVEL,
  canManageUsers,
  levelOf,
  roleLabel,
} from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function UserManagementPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editLevel, setEditLevel] = useState(10);
  const [editCustomId, setEditCustomId] = useState('');
  
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuthAndFetch();
    
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkAuthAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    const { data: profile } = await supabase.from('profiles').select('role, role_level').eq('id', user.id).single();
    
    // 人员管理要求经理 (Lv.70) 及以上；判权只依据 role_level，不再用邮箱或 role 字符串提权
    const myLevel = levelOf(profile?.role_level);
    
    if (!canManageUsers(myLevel)) {
      alert('🚫 权限不足：只有经理 (Lv.70) 及以上级别才能访问人员管理。');
      router.push('/admin');
      return;
    }
    setCurrentUser({ ...profile, id: user.id });

    // 拉取职位库
    const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*').order('level', { ascending: false });
    if (rolesError) {
      console.error("拉取职位失败，请检查 Supabase roles 表是否创建并开放权限：", rolesError);
    } else if (rolesData) {
      setRoles(rolesData);
    }

    const { data: usersData } = await supabase.from('profiles').select('*').order('role_level', { ascending: false });
    if (usersData) setUsers(usersData);

    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const isNumeric = /^\d+$/.test(searchQuery);
    
    let query = supabase.from('profiles').select('*');
    if (isNumeric) {
      query = query.or(`display_name.ilike.%${searchQuery}%,custom_id.eq.${searchQuery},random_id.eq.${searchQuery}`);
    } else {
      query = query.ilike('display_name', `%${searchQuery}%`);
    }
    
    const { data } = await query.limit(5);
    setSearchResults(data || []);
    setIsSearching(false);
  };

  const addToManageList = (user: any) => {
    if (!users.find(u => u.id === user.id)) {
      setUsers([user, ...users]);
    }
    setSearchQuery('');
    setSearchResults([]);
    handleEditClick(user); 
  };

  const handleEditClick = (user: any) => {
    setEditingId(user.id);
    setEditRole(user.role || 'member');
    setEditLevel(levelOf(user.role_level));
    setEditCustomId(user.custom_id || '');
    setRoleSearch('');
  };

  const handleSave = async (targetUser: any) => {
    // 0) 靓号格式校验：非空时必须是 4-8 位数字（与数据库 profiles_custom_id_format 约束一致）
    const trimmedCustomId = editCustomId.trim();
    if (trimmedCustomId !== '' && !/^[0-9]{4,8}$/.test(trimmedCustomId)) {
      alert('靓号必须是 4-8 位数字');
      return;
    }

    const myLevel = levelOf(currentUser?.role_level);
    const targetLevel = levelOf(targetUser.role_level);
    const isSelf = targetUser.id === currentUser?.id;
    // 开发者 (Lv.100) 可操作除自己以外的所有人
    const isDeveloper = myLevel >= ROLE_LEVEL.DEVELOPER;

    // 1) 禁止修改自己的职位/等级：
    //    把自己从 100 降级会直接让社区失去最高管理员（且无法再改回来），属于不可逆误操作。
    //    这里仍允许改自己的靓号，但 role / role_level 必须保持不变；开发者权限转移请由另一位开发者操作。
    if (isSelf && (editRole !== (targetUser.role || 'member') || editLevel !== targetLevel)) {
      alert('❌ 不能修改自己的职位或等级（防止误操作导致失去管理权限）。如需变更请联系其他开发者。');
      return;
    }

    // 2) role 与 role_level 必须保持一致：改职位/等级时以 roles 表的 level 为准，
    //    避免出现 role=developer 但 role_level=40 这类「显示开发者、实际无权限」的组合。
    const currentRole = targetUser.role || 'member';
    const roleChanged = editRole !== currentRole;
    const levelChanged = editLevel !== targetLevel;
    const roleDef = roles.find((r) => r.name === editRole);

    // roles 表未加载或该职位不存在时，禁止改职位（避免写入任意 role 字符串造成脏数据）
    if (!roleDef && roleChanged) {
      alert('❌ 职位列表未加载或该职位不存在，暂时无法修改职位，请刷新页面后重试。');
      return;
    }

    // 只改靓号（职位与等级都没变）时保持原等级不动，避免误改历史数据；
    // 只要动过职位或等级，role_level 就跟随 roles.level。
    const nextRole = roleDef ? roleDef.name : currentRole;
    const nextLevel = roleDef && (roleChanged || levelChanged) ? levelOf(roleDef.level) : targetLevel;

    if (!isSelf) {
      // 3) 不能修改同级或上级；开发者除外
      if (!isDeveloper && targetLevel >= myLevel) {
        alert('❌ 权限不足：你不能修改同级或上级的职位！');
        return;
      }

      // 4) 不能授予同级或更高职位；开发者除外
      if (!isDeveloper && nextLevel >= myLevel) {
        alert('❌ 权限不足：你不能授予别人同级或更高的职位！');
        return;
      }

      // 5) 降级另一位开发者属于高危操作，要求二次确认
      if (targetLevel >= ROLE_LEVEL.DEVELOPER && nextLevel < targetLevel) {
        if (!confirm('⚠️ 你正在降级另一位开发者，确定继续吗？此操作可能影响社区最高管理权限。')) {
          return;
        }
      }
    }

    // 自己的记录只更新靓号，绝不回写 role / role_level：
    // 即使 roles 表中的等级与历史脏数据不一致，也不会因为改靓号而意外改变自己的权限。
    const customId = editCustomId.trim() === '' ? null : editCustomId.trim();
    const updatePayload = isSelf
      ? { custom_id: customId }
      : { role: nextRole, role_level: nextLevel, custom_id: customId };

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUser.id);

    if (error) {
      alert('保存失败: ' + error.message);
    } else {
      setEditingId(null);
      checkAuthAndFetch(); 
    }
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载权限数据中...</div>;

  const myLevel = levelOf(currentUser?.role_level);
  const isDeveloper = myLevel >= ROLE_LEVEL.DEVELOPER;

  // 展示用职位名：优先 ROLE_LABELS 标准中文名，其次 roles 表的 display_name，最后回退原始 role / 等级标签
  const labelForRole = (role: string | null | undefined, level: number | null | undefined) =>
    (role ? ROLE_LABELS[role] : undefined) ||
    roles.find((r) => r.name === role)?.display_name ||
    roleLabel(role, level);

  // 非开发者最多只能授予「严格低于自己」的职位，避免越级提拔
  const allowedRoles = roles.filter((r) => isDeveloper || levelOf(r.level) < myLevel);
  const filteredRoles = allowedRoles.filter(r => 
    (ROLE_LABELS[r.name] || r.display_name || '').toLowerCase().includes(roleSearch.toLowerCase()) ||
    r.name.toLowerCase().includes(roleSearch.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">👑 人员与职位管理</h1>
            <p className="text-xs text-gray-500 mt-1">
              当前登录身份：<span className="text-blue-400 font-bold">
                {labelForRole(currentUser?.role, myLevel)}
              </span>
            </p>
          </div>
          <Link href="/admin" className="text-blue-400 hover:underline text-sm">返回控制台</Link>
        </div>

        <div className="bg-[#2c2d31] p-6 rounded-md border border-gray-700 shadow-lg">
          <h2 className="text-sm font-bold text-white mb-3">🔍 搜索并添加成员</h2>
          <div className="flex gap-4">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入玩家名称或 6 位 ID..." 
              className="flex-1 bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-bold transition">
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {searchResults.map(u => (
                <div key={u.id} className="flex justify-between items-center bg-[#18191c] p-3 rounded border border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gray-700 overflow-hidden">
                      {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">{u.display_name?.charAt(0)}</div>}
                    </div>
                    <span className="text-white font-bold">{u.display_name}</span>
                    <span className="text-xs text-gray-500">ID: {u.custom_id || u.random_id || '无'}</span>
                  </div>
                  <button onClick={() => addToManageList(u)} className="bg-green-600 hover:bg-green-700 text-white w-8 h-8 rounded-full font-bold text-lg leading-none transition">
                    +
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
          <div className="min-h-[400px]"> {/* 去掉 overflow 限制，加高一点以防万一 */}
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-[#232428] text-gray-400 text-sm border-b border-gray-700">
                  <th className="p-4">成员名称</th>
                  <th className="p-4">原始 ID</th>
                  <th className="p-4">专属靓号</th>
                  <th className="p-4">当前职位</th>
                  <th className="p-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const rowLevel = levelOf(u.role_level);
                  const isSelfRow = u.id === currentUser?.id;
                  return (
                  <tr key={u.id} className="border-b border-gray-700/50 hover:bg-[#3a3b40] transition">
                    <td className="p-4 text-white font-bold">{u.display_name || '未命名'}</td>
                    <td className="p-4 font-mono text-gray-500">{u.random_id || '-'}</td>

                    {editingId === u.id ? (
                      <>
                        <td className="p-4">
                          <input 
                            type="text" 
                            value={editCustomId} 
                            onChange={(e) => setEditCustomId(e.target.value.replace(/\D/g, ''))}
                            maxLength={8}
                            className="bg-[#18191c] border border-blue-500 rounded px-2 py-1 w-24 text-white text-sm"
                            placeholder="留空撤回"
                          />
                        </td>
                        
                        <td className="p-4">
                          <div className="relative" ref={dropdownRef}>
                            <button 
                              onClick={() => !isSelfRow && setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                              disabled={isSelfRow}
                              title={isSelfRow ? '不能修改自己的职位/等级' : undefined}
                              className={`bg-[#18191c] border border-blue-500 rounded px-3 py-1.5 w-48 text-white text-sm text-left flex justify-between items-center ${isSelfRow ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <span className="truncate">
                                {(editRole ? ROLE_LABELS[editRole] : undefined) || roles.find(r => r.name === editRole)?.display_name || editRole || '选择职位...'}
                              </span>
                              <span className="text-xs text-gray-500">▼</span>
                            </button>
                            {isSelfRow && (
                              <p className="text-[10px] text-yellow-500/80 mt-1">不能修改自己的职位/等级（可改靓号）</p>
                            )}

                            {isRoleDropdownOpen && !isSelfRow && (
                              <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-[#222] border border-gray-600 rounded shadow-2xl flex flex-col overflow-hidden">
                                <div className="p-2 border-b border-gray-700">
                                  <input 
                                    type="text"
                                    value={roleSearch}
                                    onChange={(e) => setRoleSearch(e.target.value)}
                                    placeholder="搜索职位..."
                                    className="w-full bg-[#111] text-xs text-white border border-gray-600 rounded p-1.5 focus:outline-none"
                                    autoFocus
                                  />
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                  {filteredRoles.length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-2">无匹配职位 (请检查 Supabase 数据库)</p>
                                  ) : (
                                    filteredRoles.map(r => (
                                      <div 
                                        key={r.name}
                                        onClick={() => {
                                          setEditRole(r.name);
                                          // role_level 直接取 roles.level，保证 role 与 role_level 一致
                                          setEditLevel(levelOf(r.level));
                                          setIsRoleDropdownOpen(false);
                                        }}
                                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-600 hover:text-white transition ${editRole === r.name ? 'bg-[#333] text-blue-400 font-bold' : 'text-gray-300'}`}
                                      >
                                        <div className="flex justify-between">
                                          <span>{ROLE_LABELS[r.name] || r.display_name}</span>
                                          <span className="text-xs opacity-50">Lv.{levelOf(r.level)}</span>
                                        </div>
                                        <span className="text-[10px] opacity-40">{r.department}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="p-4">
                          <button onClick={() => handleSave(u)} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm mr-2 transition">保存</button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white text-sm">取消</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 font-mono text-blue-400">
                          {u.custom_id ? (
                            <span className="bg-blue-900/30 text-blue-400 border border-blue-700/50 px-2 py-1 rounded">{u.custom_id}</span>
                          ) : (
                            <span className="text-gray-600 italic text-xs">未分配</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs border ${
                            rowLevel >= ROLE_LEVEL.SENIOR_MANAGER ? 'bg-red-900/30 text-red-500 border-red-700' :
                            rowLevel >= ROLE_LEVEL.MANAGER ? 'bg-purple-900/30 text-purple-400 border-purple-700' :
                            rowLevel >= ROLE_LEVEL.STAFF ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700' :
                            rowLevel >= ROLE_LEVEL.MEMBER ? 'bg-blue-900/30 text-blue-400 border-blue-700' :
                            'bg-gray-800 text-gray-400 border-gray-600'
                          }`}>
                            {labelForRole(u.role, rowLevel)}
                          </span>
                        </td>
                        <td className="p-4">
                          {(isSelfRow || isDeveloper || myLevel > rowLevel) ? (
                            <button onClick={() => handleEditClick(u)} className="text-blue-400 hover:text-blue-300 font-bold text-sm">编辑</button>
                          ) : (
                            <span className="text-gray-600 text-sm">不可操作</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}
