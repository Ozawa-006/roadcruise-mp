// app/admin/rules/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 允许编辑规则的最低角色权重（论坛总经理）
const ROLE_WEIGHTS: any = { developer: 100, director: 80, manager: 60, staff: 40, member: 10 };
const EDIT_RULES_MIN_ROLE = 'director'; 

export default function AdminRulesPage() {
  const [userRole, setUserRole] = useState<string>('member');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const role = profile?.role || 'member';
      
      // 权限校验：必须是总经理及以上
      if (ROLE_WEIGHTS[role] < ROLE_WEIGHTS[EDIT_RULES_MIN_ROLE] && user.email !== '420075623@qq.com') {
        alert('🚫 权限不足：只有论坛总经理及以上级别才能编辑规则。');
        router.push('/admin');
        return;
      }
      setUserRole(role);

      // 获取现有规则
      const { data: rules } = await supabase.from('site_rules').select('*').order('updated_at', { ascending: false }).limit(1);
      if (rules && rules.length > 0) {
        setTitle(rules[0].title);
        setContent(rules[0].content);
      }
      setLoading(false);
    };
    checkAuthAndLoad();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    // 简单处理：直接插入新版本，旧版本保留在数据库（可作历史记录）
    const { error } = await supabase.from('site_rules').insert([{ title, content }]);

    if (error) {
      setMsg(`保存失败: ${error.message}`);
    } else {
      setMsg('🎉 规则已更新！');
    }
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">验证权限中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 p-10 font-sans">
      <div className="max-w-3xl mx-auto bg-[#2c2d31] rounded-md border border-gray-700 shadow-2xl p-8">
        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">📜 社区规则管理</h1>
            <p className="text-xs text-gray-500 mt-1">当前身份：{userRole === 'developer' ? '开发者' : '论坛总经理'}</p>
          </div>
          <Link href="/admin" className="text-blue-400 hover:underline text-sm">返回控制台</Link>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">规则标题</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500" 
              placeholder="例如：社区总规则"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">规则正文（支持纯文本）</label>
            <textarea 
              value={content} 
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-64 focus:outline-none focus:border-blue-500 font-mono text-sm" 
              placeholder="在这里输入详细规则..."
              required
            ></textarea>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded font-bold transition shadow-lg disabled:opacity-50">
              {saving ? '发布中...' : '保存并发布'}
            </button>
            {msg && <span className="text-green-400 font-bold text-sm">{msg}</span>}
          </div>
        </form>
      </div>
    </main>
  );
}