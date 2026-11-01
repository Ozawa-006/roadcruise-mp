'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';
import RichText from '@/components/RichText';
import RichTextEditor from '@/components/RichTextEditor';
import Link from 'next/link';
import { ROLE_LEVEL, levelOf, roleLabel, roleLabelEn } from '@/lib/permissions';
import { useLocale, useTr } from '@/components/I18nProvider';
import type { Locale } from '@/lib/i18n';

interface TopicAuthorProfile {
  display_name: string | null;
  avatar_url: string | null;
}

interface ReplyAuthorProfile extends TopicAuthorProfile {
  role: string | null;
}

interface ForumTopic {
  id: string | number;
  title: string;
  title_en: string | null;
  content: string;
  content_en: string | null;
  author_id: string;
  image_url: string | null;
  created_at: string;
  replies_count?: number | null;
  profiles?: TopicAuthorProfile | null;
  forum_categories?: { name: string | null; name_en: string | null } | null;
}

interface ForumReply {
  id: string | number;
  author_id: string;
  content: string;
  content_en: string | null;
  created_at: string;
  profiles?: ReplyAuthorProfile | null;
}

interface CurrentUser {
  id: string;
}

interface ReplyFeedback {
  id: string;
  message: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 回复分页：每页 20 条 */
const REPLY_PAGE_SIZE = 20;

/** 可选英文字段：trim 后为空则写 null，避免数据库里出现空白字符串。 */
function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** 双语字段取值：英文界面且英文字段非空时用英文，否则回退中文。 */
function localizedText(
  locale: Locale,
  en: string | null | undefined,
  zh: string | null | undefined
): string {
  const english = en?.trim();
  if (locale === 'en' && english) return english;
  return zh ?? '';
}

/** 当前是否正在显示英文内容（用于展示「EN translation」徽章）。 */
function showsEnglish(locale: Locale, en: string | null | undefined): boolean {
  return locale === 'en' && !!en?.trim();
}

/** 回复列表查询字段：保持原有 profiles embed 不变 */
const REPLY_SELECT = `
  *,
  profiles:author_id (display_name, avatar_url, role)
`;

/**
 * 英文文案表（中文原文为 key）：只覆盖静态 UI 与系统提示。
 * 帖子标题/正文、回复正文、版块名、昵称、角色徽章均来自数据库或用户输入，保持原样。
 */
const EN: Record<string, string> = {
  // ---- 页面状态 ----
  '加载中...': 'Loading...',
  '帖子不存在或已被删除': 'This topic does not exist or has been deleted.',

  // ---- 面包屑 / 作者信息 ----
  '论坛': 'Forum',
  '版块': 'Board',
  '看帖': 'Topic',
  '楼主': 'OP',
  '未知用户': 'Unknown user',
  '成员': 'Member',
  '发表于：': 'Posted: ',

  // ---- 帖子 / 回复操作按钮 ----
  '编辑': 'Edit',
  '举报': 'Report',
  '🗑️ 删除帖子': '🗑️ Delete topic',
  '取消': 'Cancel',
  '保存中...': 'Saving...',
  '保存修改': 'Save changes',
  '保存': 'Save',
  '删除中...': 'Deleting...',
  '删除': 'Delete',
  '引用回复': 'Quote',

  // ---- 帖子编辑表单 ----
  '标题': 'Title',
  '请输入帖子标题（不超过 120 字）': 'Enter a topic title (maximum 120 characters)',
  '正文': 'Content',
  '编辑帖子正文...': 'Edit the topic content...',
  '配图': 'Attached image',

  // ---- 可选英文内容（英文界面优先显示，留空回退中文） ----
  '英文标题（可选）': 'English title (optional)',
  '一句话概括英文标题...': 'Summarize the English title in one sentence...',
  '英文正文（可选）': 'English content (optional)',
  '编辑英文正文...': 'Edit the English content...',
  '英文回复正文（可选）': 'English reply content (optional)',
  '在这里输入英文回复...': 'Write your reply in English...',
  '编辑英文回复内容...': 'Edit the English reply content...',

  // ---- 回复列表 ----
  '全部回复 ({n})': 'All replies ({n})',
  '还没有回复，来发表你的看法吧。': 'No replies yet. Share your thoughts.',
  '编辑回复内容...': 'Edit the reply content...',

  // ---- 回复输入区 ----
  '发表回复': 'Post reply',
  '正在回复 @{name}：': 'Replying to @{name}:',
  '写下你的看法...': 'Write your thoughts...',
  '回复 @{name}...': 'Reply to @{name}...',
  '发送中...': 'Sending...',
  '你需要登录后才能参与讨论。': 'You need to sign in to join the discussion.',
  '去登录': 'Sign in',

  // ---- 分页 ----
  '回复分页': 'Reply pagination',
  '上一页': 'Previous',
  '下一页': 'Next',
  '第': 'Page',
  // 英文语序为「Page 3 / 5」，此处不追加尾词。
  '页': '',

  // ---- 确认 / 错误 / 成功提示 ----
  '⚠️ 确定要删除这篇帖子吗？此操作不可恢复！':
    '⚠️ Delete this topic? This action cannot be undone!',
  '请先登录！': 'Please sign in first!',
  '回复失败: {msg}': 'Failed to post reply: {msg}',
  '删除失败：{msg}': 'Delete failed: {msg}',
  '🗑️ 帖子已删除': '🗑️ Topic deleted',
  '标题不能为空。': 'Title cannot be empty.',
  '标题不能超过 120 个字符。': 'Title cannot exceed 120 characters.',
  '更新帖子失败：{msg}': 'Failed to update topic: {msg}',
  '更新帖子失败，请稍后重试。': 'Failed to update topic. Please try again later.',
  '✅ 帖子已更新。': '✅ Topic updated.',
  '回复内容不能为空。': 'Reply content cannot be empty.',
  '更新回复失败：{msg}': 'Failed to update reply: {msg}',
  '更新回复失败，请稍后重试。': 'Failed to update reply. Please try again later.',
  '✅ 回复已更新。': '✅ Reply updated.',
  '确定删除这条回复吗？此操作不可恢复。':
    'Delete this reply? This action cannot be undone.',
  '删除回复失败：{msg}': 'Failed to delete reply: {msg}',
  '删除回复失败，请稍后重试。': 'Failed to delete reply. Please try again later.',
  '回复已删除': 'Reply deleted',

  // ---- 引用模板（随回复正文一起保存） ----
  '> 引用 @{name} 的发言：': '> Quoting @{name}:',
};

export default function TopicDetailPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const [quoteUser, setQuoteUser] = useState('');
  const [quoteContent, setQuoteContent] = useState('');
  const { id, topicId } = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyPage, setReplyPage] = useState(1);
  const [replyTotal, setReplyTotal] = useState(0);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const repliesSectionRef = useRef<HTMLDivElement | null>(null);

  // 用户与权限状态
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(0);

  const [replyContent, setReplyContent] = useState('');
  // 可选英文回复正文：留空则写 null，英文界面回退显示中文。
  const [replyContentEn, setReplyContentEn] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 帖子编辑状态
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicContent, setTopicContent] = useState('');
  // 可选英文字段（编辑时回填原值，保存空则写 null）
  const [topicTitleEn, setTopicTitleEn] = useState('');
  const [topicContentEn, setTopicContentEn] = useState('');
  const [savingTopic, setSavingTopic] = useState(false);
  const [topicSaveError, setTopicSaveError] = useState('');
  const [topicNotice, setTopicNotice] = useState('');

  // 回复编辑状态（同一时间只编辑一条，保存时用 id 防串行）
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEditContent, setReplyEditContent] = useState('');
  const [replyEditContentEn, setReplyEditContentEn] = useState('');
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<ReplyFeedback | null>(null);
  const [replyNotice, setReplyNotice] = useState<ReplyFeedback | null>(null);

  // 回复删除状态：deletingReplyId 为正在删除的回复 id（busy id），防止重复点击
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [replyDeleteError, setReplyDeleteError] = useState('');
  const [replyDeleteNotice, setReplyDeleteNotice] = useState('');

  // 举报入口：url 使用当前真实路径，未登录也可以跳转（/reports 自行提示登录）
  const currentPath = pathname || `/forum/${String(id)}/${String(topicId)}`;
  const reportHref = (targetType: 'topic' | 'reply', targetId: string): string =>
    `/reports?type=${targetType}&id=${encodeURIComponent(targetId)}&url=${encodeURIComponent(currentPath)}`;

  const fetchTopic = async (): Promise<ForumTopic | null> => {
    const { data: topicData } = await supabase
      .from('forum_topics')
      .select(`
        *,
        profiles:author_id (display_name, avatar_url),
        forum_categories:category_id (name, name_en)
      `)
      .eq('id', topicId)
      .single();

    if (!topicData) return null;
    const nextTopic = topicData as ForumTopic;
    setTopic(nextTopic);
    return nextTopic;
  };

  const countReplies = async (): Promise<number | null> => {
    const { count, error } = await supabase
      .from('forum_replies')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', topicId);

    if (error) return null;
    return count ?? null;
  };

  const scrollToReplies = () => {
    repliesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** 按全局总数加载指定页，返回实际加载的页码；失败时返回 null（保留当前页） */
  const loadReplyPage = async (targetPage: number, total: number): Promise<number | null> => {
    const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / REPLY_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, Math.floor(targetPage)), totalPages);
    const from = (safePage - 1) * REPLY_PAGE_SIZE;
    const to = from + REPLY_PAGE_SIZE - 1;

    setRepliesLoading(true);
    try {
      const { data, error } = await supabase
        .from('forum_replies')
        .select(REPLY_SELECT)
        .eq('topic_id', topicId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      if (error) return null;

      setReplies((data ?? []) as ForumReply[]);
      setReplyTotal(Math.max(0, total));
      setReplyPage(safePage);
      return safePage;
    } finally {
      setRepliesLoading(false);
    }
  };

  const goToReplyPage = async (targetPage: number) => {
    if (repliesLoading) return;
    const totalPages = Math.max(1, Math.ceil(replyTotal / REPLY_PAGE_SIZE));
    const nextPage = Math.min(Math.max(1, targetPage), totalPages);
    if (nextPage === replyPage) return;

    const loadedPage = await loadReplyPage(nextPage, replyTotal);
    if (loadedPage !== null) scrollToReplies();
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const topicData = await fetchTopic();
      if (cancelled) return;

      const total = (await countReplies()) ?? topicData?.replies_count ?? 0;
      if (cancelled) return;

      await loadReplyPage(1, total);
      if (!cancelled) setLoading(false);
    };
    void load();
    
    // 检查当前用户是否登录，并获取权限等级（只依据 role_level）
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
        setCurrentLevel(levelOf(data?.role_level));
      }
    };
    void getUser();

    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert(tr('请先登录！'));
    
    let finalContent = replyContent;
    if (quoteUser) {
      // 多行引用：每一行都加 "> " 前缀，避免只有第一行被富文本渲染成引用块
      const quotedLines = quoteContent
        .split(/\r?\n/)
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n');
      finalContent = `${tr('> 引用 @{name} 的发言：', { name: quoteUser })}\n${quotedLines}\n\n${replyContent}`;
    }

    if (!finalContent.trim()) return;
    setSubmitting(true);
    
    const { error } = await supabase.from('forum_replies').insert({
      topic_id: topicId,
      author_id: user.id,
      content: finalContent,
      content_en: nullIfBlank(replyContentEn)
    });

    if (!error) {
      // 注意：回复数 replies_count 由数据库触发器维护，客户端不再“读改写”该字段，
      // 避免并发回帖时互相覆盖导致计数丢失。
      setReplyContent('');
      setReplyContentEn('');
      setQuoteUser('');
      setQuoteContent('');

      // 刷新帖子（含最新 replies_count）与总回复数，然后跳到最后一页。
      const topicData = await fetchTopic();
      const counted = await countReplies();
      // 至少包含刚发布的这条回复，避免计数延迟导致停留在旧页。
      const total = Math.max(counted ?? 0, replyTotal + 1, topicData?.replies_count ?? 0);
      const lastPage = Math.max(1, Math.ceil(total / REPLY_PAGE_SIZE));
      const loadedPage = await loadReplyPage(lastPage, total);
      if (loadedPage !== null) scrollToReplies();
    } else {
      alert(tr('回复失败: {msg}', { msg: error.message }));
    }
    setSubmitting(false);
  };

  const handleDeleteTopic = async () => {
    if (!confirm(tr('⚠️ 确定要删除这篇帖子吗？此操作不可恢复！'))) return;
    
    await supabase.from('forum_replies').delete().eq('topic_id', topicId);
    const { error } = await supabase.from('forum_topics').delete().eq('id', topicId);
    
    if (error) {
      alert(tr('删除失败：{msg}', { msg: error.message }));
    } else {
      alert(tr('🗑️ 帖子已删除'));
      router.push(`/forum/${id}`);
      router.refresh();
    }
  };

  const startTopicEdit = () => {
    if (!topic) return;
    setTopicTitle(topic.title);
    setTopicContent(topic.content);
    setTopicTitleEn(topic.title_en ?? '');
    setTopicContentEn(topic.content_en ?? '');
    setTopicSaveError('');
    setTopicNotice('');
    setEditingTopic(true);
  };

  const cancelTopicEdit = () => {
    setEditingTopic(false);
    setTopicTitleEn('');
    setTopicContentEn('');
    setTopicSaveError('');
  };

  const handleSaveTopic = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!topic || savingTopic) return;

    const nextTitle = topicTitle.trim();
    if (!nextTitle) {
      setTopicSaveError('标题不能为空。');
      return;
    }
    if (nextTitle.length > 120) {
      setTopicSaveError('标题不能超过 120 个字符。');
      return;
    }

    const nextContent = topicContent;
    // 英文标题 / 正文均可选：trim 后为空则写 null，让英文界面回退中文。
    const nextTitleEn = nullIfBlank(topicTitleEn);
    const nextContentEn = nullIfBlank(topicContentEn);

    setSavingTopic(true);
    setTopicSaveError('');
    setTopicNotice('');

    try {
      const { error } = await supabase
        .from('forum_topics')
        .update({
          title: nextTitle,
          content: nextContent,
          title_en: nextTitleEn,
          content_en: nextContentEn,
        })
        .eq('id', topicId);

      if (error) {
        setTopicSaveError(tr('更新帖子失败：{msg}', { msg: error.message }));
        return;
      }

      setTopic((prev) =>
        prev
          ? {
              ...prev,
              title: nextTitle,
              content: nextContent,
              title_en: nextTitleEn,
              content_en: nextContentEn,
            }
          : prev
      );
      setEditingTopic(false);
      setTopicNotice('✅ 帖子已更新。');
    } catch (error: unknown) {
      setTopicSaveError(
        error instanceof Error
          ? tr('更新帖子失败：{msg}', { msg: error.message })
          : tr('更新帖子失败，请稍后重试。')
      );
    } finally {
      setSavingTopic(false);
    }
  };

  const startReplyEdit = (reply: ForumReply) => {
    setEditingReplyId(String(reply.id));
    setReplyEditContent(reply.content);
    setReplyEditContentEn(reply.content_en ?? '');
    setReplyError(null);
    setReplyNotice(null);
  };

  const cancelReplyEdit = () => {
    setEditingReplyId(null);
    setReplyEditContent('');
    setReplyEditContentEn('');
    setReplyError(null);
  };

  const handleSaveReply = async (reply: ForumReply) => {
    const replyId = String(reply.id);
    if (savingReplyId !== null) return;

    const nextContent = replyEditContent;
    if (!nextContent.trim()) {
      setReplyError({ id: replyId, message: '回复内容不能为空。' });
      return;
    }
    // 可选英文正文：trim 后为空则写 null。
    const nextContentEn = nullIfBlank(replyEditContentEn);

    setSavingReplyId(replyId);
    setReplyError(null);
    setReplyNotice(null);

    try {
      const { error } = await supabase
        .from('forum_replies')
        .update({ content: nextContent, content_en: nextContentEn })
        .eq('id', reply.id);

      if (error) {
        setReplyError({ id: replyId, message: tr('更新回复失败：{msg}', { msg: error.message }) });
        return;
      }

      setReplies((prev) =>
        prev.map((item) =>
          item.id === reply.id
            ? { ...item, content: nextContent, content_en: nextContentEn }
            : item
        )
      );
      setEditingReplyId(null);
      setReplyEditContent('');
      setReplyEditContentEn('');
      setReplyNotice({ id: replyId, message: '✅ 回复已更新。' });
    } catch (error: unknown) {
      setReplyError({
        id: replyId,
        message:
          error instanceof Error
            ? tr('更新回复失败：{msg}', { msg: error.message })
            : tr('更新回复失败，请稍后重试。'),
      });
    } finally {
      setSavingReplyId(null);
    }
  };

  const handleDeleteReply = async (reply: ForumReply) => {
    if (deletingReplyId !== null) return;
    if (!window.confirm(tr('确定删除这条回复吗？此操作不可恢复。'))) return;

    const replyId = String(reply.id);
    setDeletingReplyId(replyId);
    setReplyDeleteError('');
    setReplyDeleteNotice('');

    try {
      const { error } = await supabase.from('forum_replies').delete().eq('id', reply.id);

      if (error) {
        setReplyDeleteError(tr('删除回复失败：{msg}', { msg: error.message }));
        return;
      }

      // 如果正在内联编辑这条回复，删除成功后收起编辑框，避免残留无效编辑态。
      if (editingReplyId === replyId) {
        setEditingReplyId(null);
        setReplyEditContent('');
        setReplyEditContentEn('');
      }

      // 回复数 replies_count 由数据库触发器维护，这里只重新拉取总数，不手动改该字段。
      const counted = await countReplies();
      const total = Math.max(0, counted ?? replyTotal - 1);
      // 顺带刷新帖子，让本地 topic.replies_count 与触发器结果保持一致。
      await fetchTopic();
      const pageAfterDelete = Math.max(1, Math.ceil(total / REPLY_PAGE_SIZE));
      // 当前页被删空且不是第 1 页时回退上一页。
      const targetPage =
        replyPage > 1 && replyPage > pageAfterDelete
          ? replyPage - 1
          : Math.min(replyPage, pageAfterDelete);

      const loadedPage = await loadReplyPage(targetPage, total);
      if (loadedPage !== null && loadedPage !== replyPage) scrollToReplies();
      setReplyDeleteNotice('回复已删除');
    } catch (error: unknown) {
      setReplyDeleteError(
        error instanceof Error
          ? tr('删除回复失败：{msg}', { msg: error.message })
          : tr('删除回复失败，请稍后重试。')
      );
    } finally {
      setDeletingReplyId(null);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('加载中...')}</div>;
  if (!topic) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('帖子不存在或已被删除')}</div>;

  const canEditTopic =
    !!user && (user.id === topic.author_id || currentLevel >= ROLE_LEVEL.MANAGER);
  const replyTotalPages = Math.max(1, Math.ceil(replyTotal / REPLY_PAGE_SIZE));
  const roleText = (role: string): string =>
    locale === 'en' ? roleLabelEn(role, 0) : roleLabel(role, 0);

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans pb-12">
      <Navbar />
      
      {/* 🌟 顶部横幅 (已修复：优先使用帖子自带的图片) */}
      <div 
        className="w-full h-48 md:h-64 relative bg-cover bg-center bg-blue-900 border-b border-gray-700"
        style={{ backgroundImage: `url(${topic.image_url || 'https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?q=80&w=1000&auto=format&fit=crop'})` }}
      >
        <div className="absolute inset-0 bg-black/60"></div>
        <div className="absolute inset-0 flex flex-col justify-center max-w-5xl mx-auto w-full px-4 md:px-8">
          <div className="text-sm text-gray-300 mb-2 flex items-center gap-2">
            <Link href="/forum" className="hover:text-white transition">{tr('论坛')}</Link>
            <span>/</span>
            <Link href={`/forum/${id}`} className="hover:text-white transition">{localizedText(locale, topic.forum_categories?.name_en, topic.forum_categories?.name) || tr('版块')}</Link>
            <span>/</span>
            <span className="text-gray-400">{tr('看帖')}</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-md">
            {localizedText(locale, topic.title_en, topic.title)}
          </h1>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 -mt-6 relative z-10 space-y-6">
        
        {/* 🌟 楼主发帖卡片 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg shadow-2xl overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-48 bg-[#232428] p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-gray-700 shrink-0">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-bold text-white mb-3 overflow-hidden shadow-lg border-2 border-gray-600">
              {topic.profiles?.avatar_url ? <img src={topic.profiles.avatar_url} className="w-full h-full object-cover" /> : topic.profiles?.display_name?.charAt(0).toUpperCase()}
            </div>
            <h3 className="font-bold text-white text-center break-all">{topic.profiles?.display_name || tr('未知用户')}</h3>
            <p className="text-xs text-blue-400 mt-1">{tr('楼主')}</p>
          </div>
          <div className="flex-1 p-6 md:p-8">
            
            <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-gray-500 mb-6 border-b border-gray-700 pb-4">
              <span>{tr('发表于：')}{new Date(topic.created_at).toLocaleString()}</span>
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                <span>#1</span>
                {canEditTopic && !editingTopic && (
                  <button
                    type="button"
                    onClick={startTopicEdit}
                    disabled={savingTopic}
                    className="text-xs font-bold text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
                  >
                    {tr('编辑')}
                  </button>
                )}
                <Link
                  href={reportHref('topic', String(topic.id))}
                  className="text-xs font-bold text-gray-400 transition hover:text-red-400"
                >
                  {tr('举报')}
                </Link>
                {user && (user.id === topic.author_id || currentLevel >= ROLE_LEVEL.MANAGER) && (
                  <button 
                    onClick={handleDeleteTopic} 
                    className="bg-red-900/30 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded transition border border-red-700/50"
                  >
                    {tr('🗑️ 删除帖子')}
                  </button>
                )}
              </div>
            </div>
            
            {topicNotice && (
              <p role="status" className="mb-4 text-sm font-bold text-green-400">
                {tr(topicNotice)}
              </p>
            )}

            {editingTopic ? (
              <form onSubmit={handleSaveTopic} className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="topic-edit-title" className="text-sm font-bold text-gray-400">
                      {tr('标题')}
                    </label>
                    <span className="font-mono text-xs text-gray-500">{topicTitle.length} / 120</span>
                  </div>
                  <input
                    id="topic-edit-title"
                    type="text"
                    value={topicTitle}
                    onChange={(event) => setTopicTitle(event.target.value)}
                    maxLength={120}
                    required
                    placeholder={tr('请输入帖子标题（不超过 120 字）')}
                    className="w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="topic-edit-title-en" className="mb-1 block text-sm font-bold text-gray-400">
                    {tr('英文标题（可选）')}
                  </label>
                  <input
                    id="topic-edit-title-en"
                    type="text"
                    value={topicTitleEn}
                    onChange={(event) => setTopicTitleEn(event.target.value)}
                    placeholder={tr('一句话概括英文标题...')}
                    className="w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <RichTextEditor
                  value={topicContent}
                  onChange={setTopicContent}
                  rows={8}
                  label={tr('正文')}
                  placeholder={tr('编辑帖子正文...')}
                />

                <RichTextEditor
                  value={topicContentEn}
                  onChange={setTopicContentEn}
                  rows={6}
                  label={tr('英文正文（可选）')}
                  placeholder={tr('编辑英文正文...')}
                />

                {topicSaveError && (
                  <p role="alert" className="text-sm font-bold text-red-400">
                    {tr(topicSaveError)}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={cancelTopicEdit}
                    disabled={savingTopic}
                    className="rounded border border-gray-600 bg-[#18191c] px-5 py-2 text-sm font-bold text-gray-300 transition hover:border-gray-400 hover:text-white disabled:opacity-50"
                  >
                    {tr('取消')}
                  </button>
                  <button
                    type="submit"
                    disabled={savingTopic}
                    className="rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingTopic ? tr('保存中...') : tr('保存修改')}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {showsEnglish(locale, topic.content_en) && (
                  <span className="mb-3 inline-block rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                    EN translation
                  </span>
                )}
                <RichText
                  text={localizedText(locale, topic.content_en, topic.content)}
                  className="text-gray-300 text-base leading-relaxed mb-6"
                />
              </>
            )}
            {topic.image_url && (
              <div className="mt-6">
                <img src={topic.image_url} alt={tr('配图')} className="max-w-full h-auto rounded-lg border border-gray-700 shadow-md" />
              </div>
            )}
          </div>
        </div>

        {/* 🌟 回复列表区 */}
        <div
          ref={repliesSectionRef}
          className="space-y-4 scroll-mt-6"
          aria-busy={repliesLoading || deletingReplyId !== null}
        >
          <h3 className="text-xl font-bold text-white mb-4 pl-2 border-l-4 border-blue-500">
            {tr('全部回复 ({n})', { n: replyTotal })}
          </h3>

          {replyDeleteNotice && (
            <p role="status" className="mb-2 text-sm font-bold text-green-400">
              {tr(replyDeleteNotice)}
            </p>
          )}

          {replyDeleteError && (
            <p role="alert" className="mb-2 text-sm font-bold text-red-400">
              {tr(replyDeleteError)}
            </p>
          )}
          
          {replies.map((reply, index) => {
            const replyId = String(reply.id);
            const editingThisReply = editingReplyId === replyId;
            const canEditReply =
              !!user &&
              (user.id === reply.author_id || currentLevel >= ROLE_LEVEL.MANAGER);
            // 删除权限与数据库 DELETE 策略同口径：作者本人或 Lv.70+。
            const canDeleteReply =
              !!user &&
              (user.id === reply.author_id || currentLevel >= ROLE_LEVEL.MANAGER);
            const replyBusy = savingReplyId !== null;

            return (
              <div key={reply.id} className="bg-[#2c2d31] border border-gray-700 rounded-lg shadow-lg overflow-hidden flex flex-col md:flex-row">
                <div className="w-full md:w-48 bg-[#232428] p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-gray-700 shrink-0">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-2 overflow-hidden shadow-md border-2 border-gray-600">
                    {reply.profiles?.avatar_url ? <img src={reply.profiles.avatar_url} className="w-full h-full object-cover" /> : reply.profiles?.display_name?.charAt(0).toUpperCase()}
                  </div>
                  <h4 className="font-bold text-white text-center text-sm break-all">{reply.profiles?.display_name || tr('未知用户')}</h4>

                  {/* 动态徽章 */}
                  <div className="mt-2 text-center">
                    {reply.profiles?.role === 'developer' && <span className="text-xs font-bold text-red-500">🛠️ {roleText('developer')}</span>}
                    {reply.profiles?.role === 'senior_manager' && <span className="text-xs font-bold text-orange-400">🧭 {roleText('senior_manager')}</span>}
                    {reply.profiles?.role === 'director' && <span className="text-xs font-bold text-purple-400">👑 {roleText('director')}</span>}
                    {reply.profiles?.role === 'manager' && <span className="text-xs font-bold text-blue-400">🛡️ {roleText('manager')}</span>}
                    {reply.profiles?.role === 'staff' && <span className="text-xs font-bold text-green-400">🔧 {roleText('staff')}</span>}
                    {reply.profiles?.role === 'community_moderator' && <span className="text-xs font-bold text-cyan-400">🧹 {roleText('community_moderator')}</span>}
                    {(!reply.profiles?.role || reply.profiles?.role === 'member') && <span className="text-xs text-gray-500">{tr('成员')}</span>}
                  </div>
                </div>
                <div className="flex-1 p-6">
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-4 border-b border-gray-700 pb-3">
                    <span>{tr('发表于：')}{new Date(reply.created_at).toLocaleString()}</span>
                    <span>#{(replyPage - 1) * REPLY_PAGE_SIZE + index + 2}</span>
                  </div>

                  {editingThisReply ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSaveReply(reply);
                      }}
                      className="mb-4 space-y-3"
                    >
                      <RichTextEditor
                        value={replyEditContent}
                        onChange={setReplyEditContent}
                        rows={4}
                        placeholder={tr('编辑回复内容...')}
                      />

                      <RichTextEditor
                        value={replyEditContentEn}
                        onChange={setReplyEditContentEn}
                        rows={3}
                        label={tr('英文回复正文（可选）')}
                        placeholder={tr('编辑英文回复内容...')}
                      />

                      {replyError?.id === replyId && (
                        <p role="alert" className="text-xs font-bold text-red-400">
                          {tr(replyError.message)}
                        </p>
                      )}

                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={cancelReplyEdit}
                          disabled={replyBusy}
                          className="rounded border border-gray-600 bg-[#18191c] px-4 py-1.5 text-xs font-bold text-gray-300 transition hover:border-gray-400 hover:text-white disabled:opacity-50"
                        >
                          {tr('取消')}
                        </button>
                        <button
                          type="submit"
                          disabled={replyBusy}
                          className="rounded bg-blue-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingReplyId === replyId ? tr('保存中...') : tr('保存')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {replyNotice?.id === replyId && (
                        <p role="status" className="mb-2 text-xs font-bold text-green-400">
                          {tr(replyNotice.message)}
                        </p>
                      )}
                      {showsEnglish(locale, reply.content_en) && (
                        <span className="mb-2 inline-block rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                          EN translation
                        </span>
                      )}
                      <RichText
                        text={localizedText(locale, reply.content_en, reply.content)}
                        className="text-gray-300 text-sm leading-relaxed mb-4"
                      />
                    </>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-2 border-t border-gray-700/50">
                    {canEditReply && !editingThisReply && (
                      <button
                        type="button"
                        onClick={() => startReplyEdit(reply)}
                        disabled={replyBusy}
                        className="text-xs font-bold text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
                      >
                        {tr('编辑')}
                      </button>
                    )}
                    {canDeleteReply && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteReply(reply)}
                        disabled={deletingReplyId !== null}
                        className="text-xs font-bold text-red-400 transition hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deletingReplyId === replyId ? tr('删除中...') : tr('删除')}
                      </button>
                    )}
                    <Link
                      href={reportHref('reply', replyId)}
                      className="text-xs font-bold text-gray-400 transition hover:text-red-400"
                    >
                      {tr('举报')}
                    </Link>
                    {!editingThisReply && (
                      <button
                        onClick={() => {
                          setQuoteUser(reply.profiles?.display_name || tr('未知用户'));
                          setQuoteContent(reply.content);
                          document.getElementById('reply-box')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                      >
                        {tr('引用回复')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {replies.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-700 bg-[#232428]/60 p-8 text-center text-sm text-gray-500">
              {tr('还没有回复，来发表你的看法吧。')}
            </div>
          )}

          {replyTotalPages > 1 && (
            <nav
              aria-label={tr('回复分页')}
              className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-gray-700 bg-[#232428] px-4 py-3"
            >
              <button
                type="button"
                onClick={() => void goToReplyPage(replyPage - 1)}
                disabled={repliesLoading || replyPage <= 1}
                className="rounded border border-gray-600 bg-[#18191c] px-4 py-1.5 text-sm font-bold text-gray-300 transition hover:border-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tr('上一页')}
              </button>
              <span className="text-sm text-gray-400">
                {tr('第')} <span className="font-bold text-white">{replyPage}</span> / {replyTotalPages} {tr('页')}
              </span>
              <button
                type="button"
                onClick={() => void goToReplyPage(replyPage + 1)}
                disabled={repliesLoading || replyPage >= replyTotalPages}
                className="rounded border border-gray-600 bg-[#18191c] px-4 py-1.5 text-sm font-bold text-gray-300 transition hover:border-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tr('下一页')}
              </button>
            </nav>
          )}
        </div>

        {/* 回复输入框 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-6 shadow-lg mt-8">
          <h3 className="text-lg font-bold text-white mb-4">{tr('发表回复')}</h3>
          {user ? (
            <form onSubmit={handleReply}>
              {quoteUser && (
                <div className="mb-2 p-3 bg-gray-800 border-l-4 border-blue-500 rounded text-sm text-gray-400 relative">
                  <span className="font-bold text-blue-400">{tr('正在回复 @{name}：', { name: quoteUser })}</span>
                  <span className="line-clamp-1">{quoteContent}</span>
                  <button 
                    type="button" 
                    onClick={() => { setQuoteUser(''); setQuoteContent(''); }}
                    className="absolute top-2 right-2 text-gray-500 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div id="reply-box" className="mb-4">
                <RichTextEditor
                  value={replyContent}
                  onChange={setReplyContent}
                  rows={5}
                  required
                  placeholder={quoteUser ? tr('回复 @{name}...', { name: quoteUser }) : tr('写下你的看法...')}
                />
              </div>
              {/* 可选英文正文：留空时英文界面显示中文回复 */}
              <div className="mb-4">
                <RichTextEditor
                  value={replyContentEn}
                  onChange={setReplyContentEn}
                  rows={3}
                  label={tr('英文回复正文（可选）')}
                  placeholder={tr('在这里输入英文回复...')}
                />
              </div>
              <div className="text-right">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded font-bold transition disabled:opacity-50"
                >
                  {submitting ? tr('发送中...') : tr('发表回复')}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-400 mb-4">{tr('你需要登录后才能参与讨论。')}</p>
              <Link href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition">{tr('去登录')}</Link>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}