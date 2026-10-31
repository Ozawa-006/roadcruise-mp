// app/admin/news/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminNewsPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('公告');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 安全验证：防止普通玩家直接输入网址进入
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!data || data.role === 'member') {
        router.push('/');
      }
    };
    checkAuth();
  }, [router]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    try {
      let uploadedImageUrl = '';

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('covers').upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('covers').getPublicUrl(fileName);
        uploadedImageUrl = data.publicUrl;
      }

      const { error } = await supabase.from('announcements').insert([{ 
        title, content, type, image_url: uploadedImageUrl 
      }]);

      if (error) throw error;

      setMsg('🎉 发布成功！');
      setTitle(''); setContent(''); setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error: any) {
      setMsg(`发布失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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
          <div>
            <label className="block text-gray-400 mb-1 text-sm">封面轮播图</label>
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 bg-gray-800/50 flex flex-col items-center hover:border-blue-500 transition relative">
              <input id="file-upload" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <span className="text-2xl mb-2">📸</span>
              <span className="text-gray-400 text-sm">{file ? file.name : '点击选择本地图片'}</span>
            </div>
          </div>
          <div>
            <label className="block text-gray-400 mb-1 text-sm">正文内容</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white h-40 focus:outline-none focus:border-blue-500" required ></textarea>
          </div>
          <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 w-full py-3 rounded font-bold text-lg transition disabled:opacity-50 shadow-lg">
            {loading ? '正在上传并发布...' : '立即发布'}
          </button>
        </form>
        {msg && <p className={`mt-4 text-center font-bold ${msg.includes('失败') ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>}
      </div>
    </main>
  );
}