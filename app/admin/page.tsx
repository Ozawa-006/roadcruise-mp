// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  canAccessAdmin,
  canEditRules,
  canManageAnnouncements,
  canManageUsers,
  levelOf,
  roleLabel,
} from '@/lib/permissions';

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

      const { data: profile } = await supabase.from('profiles').select('role, role_level').eq('id', user.id).single();

      // 判权只看 profiles.role_level，不再根据邮箱硬编码提权
      const currentLevel = levelOf(profile?.role_level);

      if (!canAccessAdmin(currentLevel)) {
        alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能访问此控制台。');
        router.push('/');
        return;
      }

      setRoleName(roleLabel(profile?.role, currentLevel));
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
          
          {/* 🌟 人员与权限管理 (Lv.70 经理及以上可见) */}
          {canManageUsers(roleLevel) && (
            <Link href="/admin/users" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-green-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">👥</div>
              <h2 className="text-xl font-bold text-white mb-2">员工与权限管理</h2>
              <p className="text-sm text-gray-400">任命经理、版主，分配专属 ID。</p>
            </Link>
          )}

          {/* 🌟 公告与新闻发布 (Lv.40 工作人员及以上可见) */}
          {canManageAnnouncements(roleLevel) && (
            <Link href="/admin/news" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-blue-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📰</div>
              <h2 className="text-xl font-bold text-white mb-2">公告与新闻发布</h2>
              <p className="text-sm text-gray-400">发布官方公告、更新与活动新闻。</p>
            </Link>
          )}

          {/* 🌟 活动管理 (Lv.40 工作人员及以上可见) */}
          {canManageAnnouncements(roleLevel) && (
            <Link href="/admin/events" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-orange-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">🗓️</div>
              <h2 className="text-xl font-bold text-white mb-2">活动管理</h2>
              <p className="text-sm text-gray-400">发布活动、管理报名。</p>
            </Link>
          )}

          {/* 🌟 举报处理 (Lv.40 工作人员及以上可见) */}
          {canAccessAdmin(roleLevel) && (
            <Link href="/admin/reports" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-orange-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">🚩</div>
              <h2 className="text-xl font-bold text-white mb-2">举报处理</h2>
              <p className="text-sm text-gray-400">处理玩家举报与申诉。</p>
            </Link>
          )}

          {/* 🌟 社区规则管理 (Lv.90 高级社区经理及以上可见) */}
          {canEditRules(roleLevel) && (
            <Link href="/admin/rules" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-purple-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">📜</div>
              <h2 className="text-xl font-bold text-white mb-2">社区规则管理</h2>
              <p className="text-sm text-gray-400">新增、修改与发布社区规则条款。</p>
            </Link>
          )}

          {/* 🌟 操作审计 (Lv.90 高级社区经理及以上可见) */}
          {canEditRules(roleLevel) && (
            <Link href="/admin/audit" className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 hover:border-orange-500 transition shadow-lg group block">
              <div className="text-4xl mb-4 group-hover:scale-110 transition">🛡️</div>
              <h2 className="text-xl font-bold text-white mb-2">操作审计</h2>
              <p className="text-sm text-gray-400">查看关键操作记录（权限/车队/活动/规则）</p>
            </Link>
          )}

          {/* 🌟 系统设置占位 (Lv.90 及以上可见)：保留模块位置，但明确标注尚未开放 */}
          {canEditRules(roleLevel) && (
            <div
              aria-disabled="true"
              className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 opacity-70 cursor-not-allowed shadow-lg"
            >
              <div className="text-4xl mb-4">⚙️</div>
              <h2 className="text-xl font-bold text-white mb-2">系统核心设置（尚未开放）</h2>
              <p className="text-sm text-gray-400">预留模块：功能尚未上线，暂不可用。</p>
            </div>
          )}

        </div>

        {!canManageUsers(roleLevel) && !canManageAnnouncements(roleLevel) && !canEditRules(roleLevel) && (
          <p className="text-sm text-gray-500 mt-6">当前等级暂无可用后台功能，如需权限请联系经理或高级社区经理。</p>
        )}
        
        <div className="mt-12 border-t border-gray-700 pt-6">
          <Link href="/" className="text-blue-400 hover:text-white transition text-sm">
            ← 返回社区主页
          </Link>
        </div>

      </div>
    </main>
  );
}
