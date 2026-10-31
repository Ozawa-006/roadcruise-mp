'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewTopicPage() {
  const { id } = useParams();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null); // 🌟 新增图片状态
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    // 检查登录状态
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg('请先登录再发帖！');
      setLoading(false);
      return;
    }

    try {
      let uploadedImageUrl = '';

      // 🌟 1. 如果有选择文件，先上传
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `topic-${Math.random()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('forum_media')
          .upload(fileName, file);
          
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('forum_media').getPublicUrl(fileName);
        uploadedImageUrl = data.publicUrl;
      }

      // 🌟 2. 插入数据库
      const { error } = await supabase.from('forum_topics').insert({
        category_id: id,
        author_id: user.id,
        title,
        content,
        image_url: uploadedImageUrl // 存入图片链接
      });

      if (error) throw error;

      // 发帖成功，跳回当前版块列表
      router.push(`/forum/${id}`);
      router.refresh();
      
    } catch (error: any) {
      setMsg(`发帖失败: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      {/* 🌟 顶部横幅区域 */}
      <div 
        className="w-full h-48 md:h-64 relative bg-cover bg-center bg-blue-900 border-b border-gray-700"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=1000&auto=format&fit=crop')` }}
      >
        <div className="absolute inset-0 bg-black/50"></div>
        <div className="absolute inset-0 flex flex-col justify-center max-w-4xl mx-auto w-full px-4 md:px-8">
          <Link href={`/forum/${id}`} className="text-blue-300 hover:text-white transition text-sm mb-2 inline-block w-max font-bold">
            ← 返回版块
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            发布新主题
          </h1>
        </div>
      </div>

      {/* 🌟 表单区域 */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 -mt-6 relative z-10">
        <form onSubmit={handleSubmit} className="bg-[#2c2d31] border border-gray-700 p-6 md:p-8 rounded-lg shadow-2xl space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">帖子标题</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="一句话概括你的主题内容..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">正文内容</label>
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-48 focus:outline-none focus:border-blue-500"
              placeholder="在这里输入详细内容..."
              required
            ></textarea>
          </div>

          {/* 🌟 新增：图片上传组件 */}
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">添加配图 (选填)</label>
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 bg-gray-800/50 flex flex-col items-center hover:border-blue-500 transition relative">
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="text-2xl mb-2">📸</span>
              <span className="text-gray-400 text-sm">
                {file ? file.name : '点击选择一张本地图片'}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            {msg && <p className="text-red-400 font-bold text-sm">{msg}</p>}
            <button 
              type="submit" 
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded font-bold transition shadow-lg ml-auto disabled:opacity-50"
            >
              {loading ? '发布中...' : '发布帖子'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}