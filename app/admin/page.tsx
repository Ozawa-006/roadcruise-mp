'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 角色权重表
const ROLE_WEIGHTS: any = { developer: 100, director: 80, manager: 60, staff: 40, member: 10 };

export default function AdminDashboard() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      const { data } = await supabase.from('profiles').select('role, custom_id').eq('id', user.id).single();
      
      const userRole = data?.role || 'member';
      const isDevEmail = user.email === '420075623@qq.com'; // 你的最高级别邮箱验证
      
      // 🌟 核心拦截：工作人员及以上，或者你的邮箱，才能进后台
      if (ROLE_WEIGHTS[userRole] < ROLE_WEIGHTS['staff'] && !isDevEmail) {
        alert('🚫 权限不足：只有工作人员及以上级别才能访问此控制台。');
        router.push('/');
        return;
      }
      setRole(userRole);
      setLoading(false);
    };
    checkRole();
  }, [router]);

  if (loading) {
    return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">验证权限中...</div>;
  }

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">🛡️ 社区控制台</h1>
        <p className="text-gray-500 mb-8 border-b border-gray-700 pb-4">
          当前身份：<span className="text-blue-400 font-bold uppercase">{role}</span>
        </p>

        {/* 使用 2列 或 3列 的响应式网格，容纳新卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* 1. 新闻发布 (所有管理人员可见) */}
          <Link href="/admin/news" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition shadow-lg group block">
            <div className="text-4xl mb-4 group-hover:scale-110 transition">📰</div>
            <h2 className="text-xl font-bold text-white mb-2">新闻与公告发布</h2>
            <p className="text-sm text-gray-400">发布首页轮播图和官方新闻。</p>
          </Link>

          {/* 2. 人员管理 (仅 Developer 和 Director 可见) */}
          {(role === 'developer' || role === 'director') && (
            <Link href="/admin/users" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-green-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">👥</div>
              <h2 className="text-xl font-bold text-white mb-2">员工与权限管理</h2>
              <p className="text-sm text-gray-400">任命经理、版主，分配专属 ID。</p>
            </Link>
          )}

          {/* 🌟 3. 社区规则管理 (仅 Developer 和 Director 可见) */}
          {(role === 'developer' || role === 'director') && (
            <Link href="/admin/rules" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-yellow-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📜</div>
              <h2 className="text-xl font-bold text-white mb-2">社区规则管理</h2>
              <p className="text-sm text-gray-400">编辑并发布社区总规则，前台实时同步。</p>
            </Link>
          )}

          {/* 4. 系统设置 (仅 Developer 可见，暂未开发) */}
          {role === 'developer' && (
            <div className="bg-[#2c2d31] p-6 rounded-lg border border-red-900/50 hover:border-red-500 transition shadow-lg cursor-not-allowed opacity-70">
              <div className="text-4xl mb-4">⚙️</div>
              <h2 className="text-xl font-bold text-white mb-2">系统核心设置 (开发中)</h2>
              <p className="text-sm text-gray-400">仅开发者可见的底层配置。</p>
            </div>
          )}

        </div>
        
        {/* 底部返回主页按钮 */}
        <div className="mt-12 border-t border-gray-700 pt-6">
          <Link href="/" className="text-blue-400 hover:text-white transition text-sm">
            ← 返回社区主页
          </Link>
        </div>

      </div>
    </main>
  );
}