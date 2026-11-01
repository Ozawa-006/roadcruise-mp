// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [roleName, setRoleName] = useState<string>('加载中...');
  const [roleLevel, setRoleLevel] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      // 1. 拉取用户的真实等级和职位代号
      const { data: profile } = await supabase.from('profiles').select('role, role_level').eq('id', user.id).single();
      
      // 2. 最高神权兜底：只要是你的邮箱，直接锁定 Lv.100
      const isDevEmail = user.email === '420075623@qq.com'; 
      const currentLevel = isDevEmail ? 100 : (profile?.role_level || 0);
      const currentRole = profile?.role || 'member';

      // 🌟 核心拦截：等级低于 40 (工作人员) 且不是最高神权，直接踢走
      if (currentLevel < 40 && !isDevEmail) {
        alert('🚫 权限不足：只有工作人员及以上级别才能访问此控制台。');
        router.push('/');
        return;
      }

      // 3. 去职位库查一下对应的中文名字，用来装逼
      let displayName = currentRole;
      const { data: roleData } = await supabase.from('roles').select('display_name').eq('name', currentRole).single();
      if (roleData) displayName = roleData.display_name;

      setRoleName(displayName);
      setRoleLevel(currentLevel);
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
          当前身份：<span className="text-blue-400 font-bold">{roleName} (Lv.{roleLevel})</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* 1. 新闻发布 (40级及以上可见) */}
          <Link href="/admin/news" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition shadow-lg group block">
            <div className="text-4xl mb-4 group-hover:scale-110 transition">📰</div>
            <h2 className="text-xl font-bold text-white mb-2">新闻与公告发布</h2>
            <p className="text-sm text-gray-400">发布首页轮播图和官方新闻。</p>
          </Link>

          {/* 2. 人员管理 (60级及以上可见 - 组长/经理) */}
          {roleLevel >= 60 && (
            <Link href="/admin/users" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-green-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">👥</div>
              <h2 className="text-xl font-bold text-white mb-2">员工与权限管理</h2>
              <p className="text-sm text-gray-400">任命经理、版主，分配专属 ID。</p>
            </Link>
          )}

          {/* 3. 社区规则管理 (60级及以上可见) */}
          {roleLevel >= 60 && (
            <Link href="/admin/rules" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-yellow-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📜</div>
              <h2 className="text-xl font-bold text-white mb-2">社区规则管理</h2>
              <p className="text-sm text-gray-400">编辑并发布社区总规则，前台实时同步。</p>
            </Link>
          )}

          {/* 4. 系统设置 (90级及以上可见 - 游戏制作人/高级管理层) */}
          {roleLevel >= 90 && (
            <div className="bg-[#2c2d31] p-6 rounded-lg border border-red-900/50 hover:border-red-500 transition shadow-lg cursor-not-allowed opacity-70">
              <div className="text-4xl mb-4">⚙️</div>
              <h2 className="text-xl font-bold text-white mb-2">系统核心设置 (开发中)</h2>
              <p className="text-sm text-gray-400">仅最高管理层可见的底层配置。</p>
            </div>
          )}

        </div>
        
        <div className="mt-12 border-t border-gray-700 pt-6">
          <Link href="/" className="text-blue-400 hover:text-white transition text-sm">
            ← 返回社区主页
          </Link>
        </div>

      </div>
    </main>
  );
}