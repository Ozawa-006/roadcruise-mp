// app/vtc/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function VTCHome() {
  const [vtcs, setVtcs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userVtcId, setUserVtcId] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // 1. 获取当前用户状态
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('vtc_id').eq('id', user.id).single();
        if (profile?.vtc_id) setUserVtcId(profile.vtc_id);
      }

      // 2. 获取所有车队列表 (使用 count 统计每个车队的人数)
      const { data: vtcData } = await supabase
        .from('vtcs')
        .select(`
          *,
          profiles(count)
        `)
        .order('created_at', { ascending: false });
      
      if (vtcData) setVtcs(vtcData);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载车队数据中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        
        {/* 头部区域 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-gray-700 pb-4 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="w-2 h-8 bg-blue-500 inline-block rounded-sm"></span>
              VTC 虚拟车队大厅
            </h1>
            <p className="text-gray-400 text-sm">寻找属于你的车队，或者创建你自己的运输帝国。</p>
          </div>
          
          {/* 只有没加入车队的用户才能看到创建按钮 */}
          {user && !userVtcId && (
            <Link 
              href="/vtc/create" 
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg flex items-center gap-2"
            >
              <span className="text-xl">+</span> 创建车队
            </Link>
          )}
          {!user && (
            <Link 
              href="/login" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg"
            >
              登录以创建车队
            </Link>
          )}
          {user && userVtcId && (
            <div className="bg-[#2c2d31] px-4 py-2 rounded-lg border border-gray-600 text-sm">
              你已加入车队，点击右上角“我的车队”查看。
            </div>
          )}
        </div>

        {/* 车队列表网格 */}
        {vtcs.length === 0 ? (
          <div className="text-center py-20 bg-[#2c2d31] rounded-lg border border-gray-700 border-dashed">
            <p className="text-4xl mb-4">🚛</p>
            <h2 className="text-xl text-white font-bold mb-2">目前还没有车队</h2>
            <p className="text-gray-500 mb-6">成为第一个创立车队的先驱者吧！</p>
            {user && (
              <Link href="/vtc/create" className="bg-blue-600 text-white px-6 py-2 rounded font-bold">
                立即创建
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vtcs.map((vtc) => {
              // 获取人数（Supabase 联表 count 返回的是一个数组，里面有一个 count 字段）
              const memberCount = vtc.profiles?.[0]?.count || 0;

              return (
                <Link 
                  key={vtc.id} 
                  href={`/vtc/${vtc.id}`}
                  className="bg-[#2c2d31] rounded-xl border border-gray-700 shadow-lg hover:border-blue-500 transition group overflow-hidden flex flex-col"
                >
                  {/* Logo 和名字 */}
                  <div className="p-6 flex items-center gap-5 border-b border-gray-700/50">
                    <div className="w-20 h-20 bg-[#18191c] rounded-lg border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center shadow-md">
                      {vtc.logo_url ? (
                        <img src={vtc.logo_url} alt={vtc.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl">🏢</span>
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white group-hover:text-blue-400 transition mb-1 line-clamp-1">
                        {vtc.name}
                      </h2>
                      {vtc.tag && (
                        <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded font-mono border border-blue-800">
                          [{vtc.tag}]
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 简介 */}
                  <div className="p-6 flex-1">
                    <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">
                      {vtc.description || '这个车队还没有填写简介。'}
                    </p>
                  </div>

                  {/* 底部信息 */}
                  <div className="px-6 py-4 bg-[#232428] border-t border-gray-700/50 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                      <span className="text-gray-400 font-bold">{memberCount} 名成员</span>
                    </div>
                    {vtc.is_recruiting ? (
                      <span className="text-green-500 font-bold bg-green-900/20 px-2 py-1 rounded">招聘中</span>
                    ) : (
                      <span className="text-red-500 font-bold bg-red-900/20 px-2 py-1 rounded">已停止招募</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}