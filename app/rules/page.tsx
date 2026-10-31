// app/rules/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function RulesPage() {
  const [rule, setRule] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLatestRule = async () => {
      const { data } = await supabase
        .from('site_rules')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) setRule(data[0]);
      setLoading(false);
    };
    fetchLatestRule();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;
  if (!rule) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">暂无规则内容</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-10">
        <div className="mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-3xl font-bold text-white">{rule.title}</h1>
          <p className="text-sm text-gray-500 mt-2">
            最后更新时间：{new Date(rule.updated_at).toLocaleString()}
          </p>
        </div>

        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-6 md:p-8 shadow-lg">
          <div className="text-gray-300 leading-relaxed whitespace-pre-wrap font-sans text-base">
            {rule.content}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/forum" className="text-blue-400 hover:text-blue-300 transition">
            ← 返回论坛首页
          </Link>
        </div>
      </div>
    </main>
  );
}