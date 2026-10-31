'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 🌟 定义职级权重（数字越大，权力越大）
const ROLE_WEIGHTS: any = {
  developer: 100,
  director: 80,
  manager: 60,
  staff: 40,
  member: 10
};

const ROLE_LABELS: any = {
  developer: '开发者',
  director: '论坛总经理',
  manager: '社区经理',
  staff: '工作人员',
  member: '普通成员'
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string>('member');
  
  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRoleVal, setEditRoleVal] = useState('');
  const [editCustomIdVal, setEditCustomIdVal] = useState('');
  
  const router = useRouter();

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  const checkAuthAndFetch = async () => {
    // 1. 获取当前登录者的身份
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    const { data: currentUserProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const myRole = currentUserProfile?.role || 'member';
    setCurrentUserRole(myRole);

    if (myRole === 'member') return router.push('/'); // 普通玩家直接踢走

    // 2. 拉取所有用户列表
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
  };

  const handleEditClick = (user: any) => {
    setEditingId(user.id);
    setEditRoleVal(user.role || 'member');
    setEditCustomIdVal(user.custom_id || '');
  };

  const handleSave = async (targetUser: any) => {
    // 🌟 核心安全拦截：防止越权操作
    const myWeight = ROLE_WEIGHTS[currentUserRole] || 0;
    const targetWeight = ROLE_WEIGHTS[targetUser.role || 'member'];
    const newWeight = ROLE_WEIGHTS[editRoleVal];

    // 1. 你不能修改和自己平级或级别比你高的人
    if (myWeight <= targetWeight && currentUserRole !== 'developer') {
      alert('❌ 权限不足：你不能修改同级或上级的职位！');
      return;
    }

    // 2. 你不能赋予别人超过你自己级别的职位（除了开发者）
    if (myWeight < newWeight && currentUserRole !== 'developer') {
      alert('❌ 权限不足：你不能任命比自己级别更高的职位！');
      return;
    }

    // 3. 开发者不能被降级（防呆）
    if (targetUser.role === 'developer' && editRoleVal !== 'developer') {
      alert('❌ 无法降级：开发者是最高权限，不可更改。');
      return;
    }

    // 保存到数据库
    const newCustomId = editCustomIdVal.trim() === '' ? null : editCustomIdVal.trim();
    
    await supabase
      .from('profiles')
      .update({ 
        role: editRoleVal,
        custom_id: newCustomId 
      })
      .eq('id', targetUser.id);
    
    setEditingId(null);
    checkAuthAndFetch(); // 刷新列表
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 p-10 font-sans">
      <div className="max-w-6xl mx-auto bg-[#2c2d31] rounded-md border border-gray-700 shadow-2xl">
        
        <div className="bg-[#232428] px-6 py-4 border-b border-gray-700 flex justify-between items-center rounded-t-md">
          <div>
            <h1 className="text-xl font-bold text-white">👑 人员与职位管理</h1>
            <p className="text-xs text-gray-500 mt-1">当前登录身份：<span className="text-blue-400 font-bold">{ROLE_LABELS[currentUserRole]}</span></p>
          </div>
          <Link href="/admin" className="text-blue-400 text-sm hover:underline">返回控制台</Link>
        </div>

        <div className="p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-sm">
                <th className="py-3 px-4">玩家名称</th>
                <th className="py-3 px-4">原始 ID</th>
                <th className="py-3 px-4">专属靓号 (留空撤回)</th>
                <th className="py-3 px-4">职位</th>
                <th className="py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-700/50 hover:bg-[#3a3b40] transition">
                  <td className="py-3 px-4 text-white font-bold">{u.display_name || '未命名玩家'}</td>
                  <td className="py-3 px-4 font-mono text-gray-500">{u.random_id || '-'}</td>

                  {editingId === u.id ? (
                    <>
                      <td className="py-3 px-4">
                        <input 
                          type="text" 
                          value={editCustomIdVal} 
                          onChange={(e) => setEditCustomIdVal(e.target.value)}
                          className="bg-[#18191c] border border-blue-500 rounded px-2 py-1 w-28 text-white placeholder-gray-600"
                          placeholder="留空即撤回"
                        />
                      </td>
                      <td className="py-3 px-4">
                        {/* 🌟 下拉选择框 */}
                        <select 
                          value={editRoleVal}
                          onChange={(e) => setEditRoleVal(e.target.value)}
                          className="bg-[#18191c] border border-blue-500 rounded px-2 py-1 w-32 text-white focus:outline-none"
                        >
                          {/* 如果当前是开发者，显示所有职位 */}
                          {currentUserRole === 'developer' ? (
                            <>
                              <option value="developer">开发者</option>
                              <option value="director">论坛总经理</option>
                              <option value="manager">社区经理</option>
                              <option value="staff">工作人员</option>
                              <option value="member">普通成员</option>
                            </>
                          ) : currentUserRole === 'director' ? (
                            <>
                              <option value="manager">社区经理</option>
                              <option value="staff">工作人员</option>
                              <option value="member">普通成员</option>
                            </>
                          ) : currentUserRole === 'manager' ? (
                            <>
                              <option value="staff">工作人员</option>
                              <option value="member">普通成员</option>
                            </>
                          ) : null}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <button onClick={() => handleSave(u)} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm mr-2 transition">保存</button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white text-sm">取消</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-4 font-mono text-blue-400">
                        {u.custom_id ? (
                          <span className="bg-blue-900/30 text-blue-400 border border-blue-700/50 px-2 py-1 rounded">{u.custom_id}</span>
                        ) : (
                          <span className="text-gray-600 italic text-xs">未分配</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs border ${
                          u.role === 'developer' ? 'bg-red-900/30 text-red-500 border-red-700/50' :
                          u.role === 'director' ? 'bg-purple-900/30 text-purple-400 border-purple-700/50' :
                          u.role === 'manager' ? 'bg-blue-900/30 text-blue-400 border-blue-700/50' :
                          u.role === 'staff' ? 'bg-green-900/30 text-green-400 border-green-700/50' :
                          'bg-gray-800 text-gray-400 border-gray-600'
                        }`}>
                          {ROLE_LABELS[u.role || 'member']}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {/* 只有当你有权限修改对方时，才显示编辑按钮 */}
                        {(ROLE_WEIGHTS[currentUserRole] > ROLE_WEIGHTS[u.role || 'member'] || currentUserRole === 'developer') && u.role !== 'developer' ? (
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
    </main>
  );
}