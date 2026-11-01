'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/components/RichTextEditor';
import { canManageAnnouncements, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type RecentAnnouncement = {
  id: number;
  title: string | null;
  title_en: string | null;
  content_en: string | null;
  created_at: string | null;
};

export default function AdminNewsPage() {
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [content, setContent] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [type, setType] = useState('公告');
  
  // 🌟 改成纯输入链接，不需要上传状态了
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [recent, setRecent] = useState<RecentAnnouncement[]>([]);
  const router = useRouter();

  // 最近公告：用于快速确认哪些条目已有英文翻译（列表小标记）。
  const loadRecent = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,title_en,content_en,created_at')
        .order('created_at', { ascending: false })
        .limit(8);

      if (!error && data) {
        setRecent(data as RecentAnnouncement[]);
      }
    } catch {
      // 列表加载失败不影响发布流程，静默保留原列表。
    }
  }, []);

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
      void loadRecent();
    };
    checkAuth();
  }, [router, loadRecent]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    // 🌟 直接把链接存入数据库；英文为空时写 null，英文界面自动回退中文。
    const { error } = await supabase.from('announcements').insert([{ 
      title, 
      content, 
      title_en: titleEn.trim() || null,
      content_en: contentEn.trim() || null,
      type, 
      image_url: imageUrl, 
      link_url: linkUrl 
    }]);

    if (error) {
      setMsg(`发布失败: ${error.message}`);
    } else {
      setMsg('🎉 已发布，去新闻页查看。');
      setTitle('');
      setTitleEn('');
      setContent('');
      setContentEn('');
      setImageUrl('');
      setLinkUrl('');
      await loadRecent();
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

          <div>
            <label htmlFor="admin-news-title-en" className="block text-gray-400 mb-1 text-sm">
              英文标题（选填 · 英文界面优先显示）
            </label>
            <input
              id="admin-news-title-en"
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 p-3 rounded text-white focus:outline-none focus:border-blue-500"
              placeholder="English title (optional)"
            />
            <p className="mt-1 text-xs text-gray-500">留空时英文界面回退中文标题。</p>
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
            <RichTextEditor
              label="正文内容"
              value={content}
              onChange={setContent}
              rows={8}
              required
              placeholder="支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题"
            />
          </div>

          <div>
            <RichTextEditor
              label="English content（选填 · 英文界面优先显示）"
              value={contentEn}
              onChange={setContentEn}
              rows={6}
              placeholder="Optional English content. Supports the same **Markdown** syntax."
            />
            <p className="mt-1 text-xs text-gray-500">留空时英文界面回退中文正文。</p>
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

        <div className="mt-8 border-t border-gray-700 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-200">最近公告</h2>
            <span className="text-[11px] text-gray-500">EN 标记表示是否已有英文翻译</span>
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-gray-500">暂无公告。</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((item) => {
                const hasTitleEn = Boolean(item.title_en?.trim());
                const hasContentEn = Boolean(item.content_en?.trim());
                const hasEn = hasTitleEn || hasContentEn;
                const fullEn = hasTitleEn && hasContentEn;

                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded border border-gray-700 bg-[#18191c] px-3 py-2"
                  >
                    <Link
                      href={`/news/${item.id}`}
                      className="min-w-0 truncate text-sm text-gray-300 transition hover:text-blue-400"
                    >
                      {item.title?.trim() || '未命名公告'}
                    </Link>
                    <span
                      className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${
                        fullEn
                          ? 'border-green-500/40 bg-green-500/15 text-green-300'
                          : hasEn
                            ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
                            : 'border-gray-600 bg-[#232428] text-gray-400'
                      }`}
                    >
                      {fullEn ? 'EN 完整' : hasEn ? 'EN 部分' : '仅中文'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
