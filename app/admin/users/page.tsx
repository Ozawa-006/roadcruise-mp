// app/admin/users/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
    
    const isDev = user.email === '420075623@qq.com' || profile?.role === 'developer';
    const myLevel = isDev ? 100 : (profile?.role_level || 10);
    
    if (myLevel < 60 && !isDev) {
      alert('🚫 权限不足：只有组长及以上级别才能访问人员管理。');
      router.push('/admin');
      return;
    }
    setCurrentUser({ ...profile, id: user.id, email: user.email }); 

    // 🌟 修复：拉取职位库，并加上错误日志打印
    const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*').order('level', { ascending: false });
    if (rolesError) {
      console.error("拉取职位失败，请检查 Supabase roles 表是否创建并开放权限：", rolesError);
    } else if (rolesData) {
      console.log("拉取到的职位库：", rolesData);
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
    setEditLevel(user.role_level || 10);
    setEditCustomId(user.custom_id || '');
    setRoleSearch('');
  };

  const handleSave = async (targetUser: any) => {
    const isDev = currentUser?.email === '420075623@qq.com' || currentUser?.role === 'developer';
    const myLevel = isDev ? 100 : (currentUser?.role_level || 0);
    const targetLevel = targetUser.role_level || 0;

    if (!isDev) {
      if (myLevel <= targetLevel) {
        alert('❌ 权限不足：你不能修改同级或上级的职位！');
        return;
      }
      if (myLevel < editLevel) {
        alert('❌ 权限不足：你不能赋予别人比自己更高的职位！');
        return;
      }
    }

    if (targetUser.email === '420075623@qq.com' && editLevel !== 100) {
      alert('❌ 无法降级：不能修改最高开发者的权限。');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ 
        role: editRole,
        role_level: editLevel,
        custom_id: editCustomId.trim() === '' ? null : editCustomId.trim()
      })
      .eq('id', targetUser.id);

    if (error) {
      alert('保存失败: ' + error.message);
    } else {
      setEditingId(null);
      checkAuthAndFetch(); 
    }
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载权限数据中...</div>;

  const isGlobalDev = currentUser?.email === '420075623@qq.com' || currentUser?.role === 'developer';
  const myLevel = isGlobalDev ? 100 : (currentUser?.role_level || 0);
  
  const allowedRoles = roles.filter(r => r.level <= myLevel || isGlobalDev);
  const filteredRoles = allowedRoles.filter(r => 
    r.display_name.toLowerCase().includes(roleSearch.toLowerCase()) || 
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
                {roles.find(r => r.name === currentUser?.role)?.display_name || '开发者'}
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

        <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg overflow-visible">
          <div className="overflow-x-auto min-h-[300px]">
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
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-700/50 hover:bg-[#3a3b40] transition">
                    <td className="p-4 text-white font-bold">{u.display_name || '未命名'}</td>
                    <td className="p-4 font-mono text-gray-500">{u.random_id || '-'}</td>

                    {editingId === u.id ? (
                      <>
                        <td className="p-4">
                          <input 
                            type="text" 
                            value={editCustomId} 
                            onChange={(e) => setEditCustomId(e.target.value)}
                            className="bg-[#18191c] border border-blue-500 rounded px-2 py-1 w-24 text-white text-sm"
                            placeholder="留空撤回"
                          />
                        </td>
                        
                        <td className="p-4">
                          <div className="relative" ref={dropdownRef}>
                            <button 
                              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                              className="bg-[#18191c] border border-blue-500 rounded px-3 py-1.5 w-48 text-white text-sm text-left flex justify-between items-center"
                            >
                              <span className="truncate">{roles.find(r => r.name === editRole)?.display_name || '选择职位...'}</span>
                              <span className="text-xs text-gray-500">▼</span>
                            </button>

                            {isRoleDropdownOpen && (
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
                                          setEditLevel(r.level);
                                          setIsRoleDropdownOpen(false);
                                        }}
                                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-600 hover:text-white transition ${editRole === r.name ? 'bg-[#333] text-blue-400 font-bold' : 'text-gray-300'}`}
                                      >
                                        <div className="flex justify-between">
                                          <span>{r.display_name}</span>
                                          <span className="text-xs opacity-50">Lv.{r.level}</span>
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
                            u.role_level >= 90 ? 'bg-red-900/30 text-red-500 border-red-700' :
                            u.role_level >= 70 ? 'bg-purple-900/30 text-purple-400 border-purple-700' :
                            u.role_level >= 60 ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700' :
                            u.role_level >= 30 ? 'bg-blue-900/30 text-blue-400 border-blue-700' :
                            'bg-gray-800 text-gray-400 border-gray-600'
                          }`}>
                            {roles.find(r => r.name === u.role)?.display_name || u.role || '未分配'}
                          </span>
                        </td>
                        <td className="p-4">
                          {(myLevel > (u.role_level || 0) || isGlobalDev) && u.email !== '420075623@qq.com' ? (
                            <button onClick={() => handleEditClick(u)} className="text-blue-400 hover:text-blue-300 font-bold text-sm">编辑</button>
                          ) : (
                            <span className="text-gray-600 text-sm">不可操作</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}