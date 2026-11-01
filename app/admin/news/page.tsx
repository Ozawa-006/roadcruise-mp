'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canManageAnnouncements, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminNewsPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('公告');
  
  // 🌟 改成纯输入链接，不需要上传状态了
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // 安全验证：只依据 profiles.role_level；发布新闻/公告要求工作人员 (Lv.40) 及以上
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      
      const { data } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
      if (!canManageAnnouncements(levelOf(data?.role_level))) {
        alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能发布新闻与公告。');
        router.push('/');
        return;
      }
      setChecking(false);
    };
    checkAuth();
  }, [router]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    // 🌟 直接把链接存入数据库
    const { error } = await supabase.from('announcements').insert([{ 
      title, 
      content, 
      type, 
      image_url: imageUrl, 
      link_url: linkUrl 
    }]);

    if (error) {
      setMsg(`发布失败: ${error.message}`);
    } else {
      setMsg('🎉 已发布，去新闻页查看。');
      setTitle('');
      setContent('');
      setImageUrl('');
      setLinkUrl('');
    }
    setLoading(false);
  };

  if (checking) {
    return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">验证权限中...</div>;
  }

  return (
    <main className="min-h-screen bg-[#18191c] text-white p-10 flex flex-col items-center font-sans">
      <div className="w-full max-w-2xl bg-[#2c2d31] p-8 rounded-xl border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-bold text-blue-400">📰 发布官方新闻</h1>
          <Link href="/admin" className="text-gray-400 hover:text-white transition">← 返回控制台</Link>
        </div>
        
        <form onSubmit={handlePublish} className="space-y-5">
          <div>
            <label className="block text-gray-400 mb-1 text-sm">新闻类型</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500">
              <option value="公告">公告</option>
              <option value="更新">更新</option>
              <option value="新闻">新闻</option>
              <option value="活动">活动</option>
            </select>
          </div>
          
          <div>
            <label className="block text-gray-400 mb-1 text-sm">新闻标题</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500" required />
          </div>

          {/* 🌟 改成图片 URL 输入框 */}
          <div>
            <label className="block text-gray-400 mb-1 text-sm">封面图片 URL (推荐 Imgur 直链)</label>
            <input 
              type="url" 
              value={imageUrl} 
              onChange={(e) => setImageUrl(e.target.value)} 
              className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500" 
              placeholder="https://i.imgur.com/xxxxx.jpg" 
            />
          </div>

          {/* 🌟 改成跳转链接 URL 输入框 */}
          <div>
            <label className="block text-gray-400 mb-1 text-sm">点击图片跳转链接 (选填，不填则跳转站内详情)</label>
            <input 
              type="url" 
              value={linkUrl} 
              onChange={(e) => setLinkUrl(e.target.value)} 
              className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500" 
              placeholder="https://www.roadcruise-mp.com/xxx" 
            />
          </div>

          <div>
            <label className="block text-gray-400 mb-1 text-sm">正文内容</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white h-40 focus:outline-none focus:border-blue-500" required ></textarea>
          </div>
          
          <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 w-full py-3 rounded font-bold text-lg transition disabled:opacity-50 shadow-lg">
            {loading ? '正在发布...' : '立即发布'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/news" className="text-sm text-blue-400 hover:text-blue-300 transition">
            查看新闻列表 →
          </Link>
        </div>

        {msg && <p className={`mt-4 text-center font-bold ${msg.includes('失败') ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>}
      </div>
    </main>
  );
}
