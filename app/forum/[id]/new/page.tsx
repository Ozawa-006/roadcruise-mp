'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';
import Link from 'next/link';
import { canPostOfficialTopic, levelOf } from '../../../../lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewTopicPage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tag, setTag] = useState('综合讨论'); 
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  // null = 权限检查中；false = 无权发帖；true = 可以发帖
  const [canPost, setCanPost] = useState<boolean | null>(null);
  const [blockReason, setBlockReason] = useState('');

  // 页面级兜底：列表页隐藏按钮不等于拦截，必须在本页也校验一次（最终仍由数据库 RLS 兜底）
  useEffect(() => {
    let cancelled = false;

    const checkPermission = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setCanPost(false);
          setBlockReason('请先登录再发帖。');
        }
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_level, steam_verified')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      if (!profile?.steam_verified) {
        setCanPost(false);
        setBlockReason('您的账号尚未完成 Steam 正版验证，请先到「账号设置」绑定 Steam 后再发帖。');
        return;
      }

      if (String(id) === '1' && !canPostOfficialTopic(levelOf(profile.role_level))) {
        setCanPost(false);
        setBlockReason('官方公告版块仅限经理 (Lv.70) 及以上发布，您当前没有该版块的发帖权限。');
        return;
      }

      setCanPost(true);
    };

    void checkPermission();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg('请先登录再发帖！');
      setLoading(false);
      return;
    }

    // 提交前再校验一次官方公告版块权限（避免仅在页面加载时判断带来的绕过）
    if (String(id) === '1') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role_level')
        .eq('id', user.id)
        .single();
      if (!canPostOfficialTopic(levelOf(profile?.role_level))) {
        setMsg('❌ 官方公告版块仅限经理 (Lv.70) 及以上发布。');
        setLoading(false);
        return;
      }
    }

    // 🌟 核心修改：如果是官方公告版块 (ID为1)，强制标签设为"官方公告"
    const finalTag = String(id) === '1' ? '官方公告' : tag;

    const { error } = await supabase.from('forum_topics').insert({
      category_id: id,
      author_id: user.id,
      title,
      content,
      image_url: imageUrl,
      tag: finalTag
    });

    if (error) {
      setMsg(`发帖失败: ${error.message}`);
      setLoading(false);
    } else {
      router.push(`/forum/${id}`);
      router.refresh();
    }
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      {/* 顶部横幅区域 */}
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

      {/* 表单区域 */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 -mt-6 relative z-10">
        {canPost === null ? (
          <div className="bg-[#2c2d31] border border-gray-700 p-8 rounded-lg text-center text-gray-400">
            正在检查发帖权限...
          </div>
        ) : canPost === false ? (
          <div className="bg-[#2c2d31] border border-red-900/50 p-8 rounded-lg text-center space-y-4">
            <p className="text-red-400 font-bold">{blockReason}</p>
            <Link href={`/forum/${id}`} className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition">
              返回版块
            </Link>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="bg-[#2c2d31] border border-gray-700 p-6 md:p-8 rounded-lg shadow-2xl space-y-6">
          
          {/* 🌟 优化：只有非官方公告版块 (ID不为1) 才显示分类下拉框 */}
          {id !== '1' && (
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">主题分类</label>
              <select 
                value={tag} 
                onChange={(e) => setTag(e.target.value)}
                className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="综合讨论">综合讨论</option>
                <option value="卡车展示">卡车展示</option>
                <option value="图片/截图">图片/截图</option>
                <option value="技术教程">技术教程</option>
                <option value="提问求助">提问求助</option>
              </select>
            </div>
          )}

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

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">添加配图链接 (选填)</label>
            <input 
              type="url" 
              value={imageUrl} 
              onChange={(e) => setImageUrl(e.target.value)} 
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500" 
              placeholder="https://i.imgur.com/xxxxx.jpg (推荐图床直链)" 
            />
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
        )}
      </div>
    </main>
  );
}