'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';
import RichTextEditor from '@/components/RichTextEditor';
import Link from 'next/link';
import { canPostOfficialTopic, levelOf } from '../../../../lib/permissions';
import { useTr } from '@/components/I18nProvider';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 英文文案表（中文原文为 key）：只覆盖静态 UI 与系统提示。
 * 主题分类选项、版块名等作为数据写入数据库，保持原样不翻译。
 */
const EN: Record<string, string> = {
  // ---- 页头 ----
  '← 返回版块': '← Back to board',
  '发布新主题': 'New Topic',

  // ---- 权限提示 ----
  '正在检查发帖权限...': 'Checking posting permission...',
  '返回版块': 'Back to board',
  '请先登录再发帖。': 'Please sign in before posting.',
  '您的账号尚未完成 Steam 正版验证，请先到「账号设置」绑定 Steam 后再发帖。':
    'Your account has not completed Steam verification. Please link Steam in Account Settings before posting.',
  '官方公告版块仅限经理 (Lv.70) 及以上发布，您当前没有该版块的发帖权限。':
    'The official announcements board is restricted to Manager (Lv.70) and above. You do not have permission to post in this board.',

  // ---- 官方公告版块（category_id = 1，只读，统一由后台发布） ----
  '官方公告版块': 'Official Announcements',
  '官方公告由后台发布，请前往新闻页查看':
    'Official announcements are published from the admin console. Please view them on the news page.',
  '前往新闻页': 'Go to news',

  // ---- 表单 ----
  '主题分类': 'Topic category',
  '帖子标题': 'Topic title',
  '一句话概括你的主题内容...': 'Summarize your topic in one sentence...',
  '正文内容': 'Content',
  '在这里输入详细内容... 支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题':
    'Enter the details here... supports **bold**, *italic*, `code`, [link](https://...), ![image](https://...), > quote, - list, ## heading',

  // ---- 可选英文内容（英文界面优先显示，留空回退中文） ----
  '英文标题（可选）': 'English title (optional)',
  '一句话概括英文标题...': 'Summarize the English title in one sentence...',
  '英文正文（可选）': 'English content (optional)',
  '在这里输入英文内容... 支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题':
    'Enter the English content here... supports **bold**, *italic*, `code`, [link](https://...), ![image](https://...), > quote, - list, ## heading',

  '添加配图链接 (选填)': 'Image URL (optional)',
  'https://i.imgur.com/xxxxx.jpg (推荐图床直链)':
    'https://i.imgur.com/xxxxx.jpg (direct image link recommended)',

  // ---- 提交 ----
  '发布中...': 'Publishing...',
  '发布帖子': 'Publish post',

  // ---- 提交错误提示 ----
  '请先登录再发帖！': 'Please sign in before posting!',
  '❌ 官方公告版块仅限经理 (Lv.70) 及以上发布。':
    '❌ The official announcements board is restricted to Manager (Lv.70) and above.',
  '发帖失败: {msg}': 'Failed to post: {msg}',
};

/** 可选英文字段：trim 后为空则写 null，避免数据库里出现空白字符串。 */
function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function NewTopicPage() {
  const tr = useTr(EN);
  const { id } = useParams();
  const router = useRouter();
  // 官方公告版块（category_id = 1）已改为只读展示 announcements，这里不再提供发帖表单。
  const isOfficialBoard = String(id) === '1';
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tag, setTag] = useState('综合讨论'); 
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  // null = 权限检查中；false = 无权发帖；true = 可以发帖
  const [canPost, setCanPost] = useState<boolean | null>(null);
  // 存中文文案 key，渲染时再过 tr()，切换语言后提示也会跟着变。
  const [blockReason, setBlockReason] = useState('');

  // 页面级兜底：列表页隐藏按钮不等于拦截，必须在本页也校验一次（最终仍由数据库 RLS 兜底）
  useEffect(() => {
    let cancelled = false;

    const checkPermission = async () => {
      // 官方公告版块不再提供发帖页：跳过权限检查，页面只展示只读提示。
      if (isOfficialBoard) {
        setCanPost(false);
        return;
      }

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
  }, [id, isOfficialBoard]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg(tr('请先登录再发帖！'));
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
        setMsg(tr('❌ 官方公告版块仅限经理 (Lv.70) 及以上发布。'));
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
      title_en: nullIfBlank(titleEn),
      content_en: nullIfBlank(contentEn),
      image_url: imageUrl,
      tag: finalTag
    });

    if (error) {
      setMsg(tr('发帖失败: {msg}', { msg: error.message }));
      setLoading(false);
    } else {
      router.push(`/forum/${id}`);
      router.refresh();
    }
  };

  // 官方公告版块：不渲染发帖表单，避免旧链接/收藏夹继续进入发帖流程。
  if (isOfficialBoard) {
    return (
      <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
        <Navbar />

        <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8">
          <div className="mt-8 bg-[#2c2d31] border border-gray-700 p-8 rounded-lg shadow-2xl text-center space-y-4">
            <p className="text-3xl" aria-hidden="true">📢</p>
            <h1 className="text-2xl font-black text-white">{tr('官方公告版块')}</h1>
            <p className="text-sm text-gray-400">{tr('官方公告由后台发布，请前往新闻页查看')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link href="/news" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold transition shadow-lg">
                {tr('前往新闻页')}
              </Link>
              <Link href={`/forum/${id}`} className="bg-[#232428] hover:bg-[#3a3b40] border border-gray-600 text-gray-200 px-6 py-2 rounded font-bold transition">
                {tr('返回版块')}
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
            {tr('← 返回版块')}
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            {tr('发布新主题')}
          </h1>
        </div>
      </div>

      {/* 表单区域 */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 -mt-6 relative z-10">
        {canPost === null ? (
          <div className="bg-[#2c2d31] border border-gray-700 p-8 rounded-lg text-center text-gray-400">
            {tr('正在检查发帖权限...')}
          </div>
        ) : canPost === false ? (
          <div className="bg-[#2c2d31] border border-red-900/50 p-8 rounded-lg text-center space-y-4">
            <p className="text-red-400 font-bold">{tr(blockReason)}</p>
            <Link href={`/forum/${id}`} className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition">
              {tr('返回版块')}
            </Link>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="bg-[#2c2d31] border border-gray-700 p-6 md:p-8 rounded-lg shadow-2xl space-y-6">
          
          {/* 🌟 优化：只有非官方公告版块 (ID不为1) 才显示分类下拉框 */}
          {id !== '1' && (
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">{tr('主题分类')}</label>
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
            <label className="block text-sm font-bold text-gray-400 mb-2">{tr('帖子标题')}</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
              placeholder={tr('一句话概括你的主题内容...')}
              required
            />
          </div>

          {/* 可选英文标题：留空时英文界面显示中文标题 */}
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">{tr('英文标题（可选）')}</label>
            <input 
              type="text" 
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
              placeholder={tr('一句话概括英文标题...')}
            />
          </div>

          <div>
            <RichTextEditor
              label={tr('正文内容')}
              value={content}
              onChange={setContent}
              placeholder={tr('在这里输入详细内容... 支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题')}
              rows={8}
              required
            />
          </div>

          {/* 可选英文正文：留空时英文界面显示中文正文 */}
          <div>
            <RichTextEditor
              label={tr('英文正文（可选）')}
              value={contentEn}
              onChange={setContentEn}
              placeholder={tr('在这里输入英文内容... 支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题')}
              rows={6}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">{tr('添加配图链接 (选填)')}</label>
            <input 
              type="url" 
              value={imageUrl} 
              onChange={(e) => setImageUrl(e.target.value)} 
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500" 
              placeholder={tr('https://i.imgur.com/xxxxx.jpg (推荐图床直链)')} 
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            {msg && <p className="text-red-400 font-bold text-sm">{msg}</p>}
            <button 
              type="submit" 
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded font-bold transition shadow-lg ml-auto disabled:opacity-50"
            >
              {loading ? tr('发布中...') : tr('发布帖子')}
            </button>
          </div>
        </form>
        )}
      </div>
    </main>
  );
}