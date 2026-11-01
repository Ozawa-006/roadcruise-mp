'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';
import RichText from '@/components/RichText';
import RichTextEditor from '@/components/RichTextEditor';
import Link from 'next/link';
import { ROLE_LEVEL, levelOf } from '@/lib/permissions';

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
  content: string;
  author_id: string;
  image_url: string | null;
  created_at: string;
  profiles?: TopicAuthorProfile | null;
  forum_categories?: { name: string | null } | null;
}

interface ForumReply {
  id: string | number;
  author_id: string;
  content: string;
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

export default function TopicDetailPage() {
  const [quoteUser, setQuoteUser] = useState('');
  const [quoteContent, setQuoteContent] = useState('');
  const { id, topicId } = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);

  // 用户与权限状态
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(0);

  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 帖子编辑状态
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicContent, setTopicContent] = useState('');
  const [savingTopic, setSavingTopic] = useState(false);
  const [topicSaveError, setTopicSaveError] = useState('');
  const [topicNotice, setTopicNotice] = useState('');

  // 回复编辑状态（同一时间只编辑一条，保存时用 id 防串行）
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEditContent, setReplyEditContent] = useState('');
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<ReplyFeedback | null>(null);
  const [replyNotice, setReplyNotice] = useState<ReplyFeedback | null>(null);

  // 举报入口：url 使用当前真实路径，未登录也可以跳转（/reports 自行提示登录）
  const currentPath = pathname || `/forum/${String(id)}/${String(topicId)}`;
  const reportHref = (targetType: 'topic' | 'reply', targetId: string): string =>
    `/reports?type=${targetType}&id=${encodeURIComponent(targetId)}&url=${encodeURIComponent(currentPath)}`;

  const fetchTopicAndReplies = async () => {
    // 1. 获取帖子信息
    const { data: topicData } = await supabase
      .from('forum_topics')
      .select(`
        *,
        profiles:author_id (display_name, avatar_url),
        forum_categories:category_id (name)
      `)
      .eq('id', topicId)
      .single();

    if (topicData) setTopic(topicData);

    // 2. 获取回复列表
    const { data: replyData } = await supabase
      .from('forum_replies')
      .select(`
        *,
        profiles:author_id (display_name, avatar_url, role)
      `)
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });

    if (replyData) setReplies(replyData);
    setLoading(false);
  };

  useEffect(() => {
    fetchTopicAndReplies();
    
    // 检查当前用户是否登录，并获取权限等级（只依据 role_level）
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
        setCurrentLevel(levelOf(data?.role_level));
      }
    };
    getUser();
  }, [topicId]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert('请先登录！');
    
    let finalContent = replyContent;
    if (quoteUser) {
      // 多行引用：每一行都加 "> " 前缀，避免只有第一行被富文本渲染成引用块
      const quotedLines = quoteContent
        .split(/\r?\n/)
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n');
      finalContent = `> 引用 @${quoteUser} 的发言：\n${quotedLines}\n\n${replyContent}`;
    }

    if (!finalContent.trim()) return;
    setSubmitting(true);
    
    const { error } = await supabase.from('forum_replies').insert({
      topic_id: topicId,
      author_id: user.id,
      content: finalContent
    });

    if (!error) {
      // 注意：回复数 replies_count 由数据库触发器维护，客户端不再“读改写”该字段，
      // 避免并发回帖时互相覆盖导致计数丢失。
      setReplyContent('');
      setQuoteUser('');
      setQuoteContent('');
      await fetchTopicAndReplies();
    } else {
      alert('回复失败: ' + error.message);
    }
    setSubmitting(false);
  };

  const handleDeleteTopic = async () => {
    if (!confirm('⚠️ 确定要删除这篇帖子吗？此操作不可恢复！')) return;
    
    await supabase.from('forum_replies').delete().eq('topic_id', topicId);
    const { error } = await supabase.from('forum_topics').delete().eq('id', topicId);
    
    if (error) {
      alert('删除失败：' + error.message);
    } else {
      alert('🗑️ 帖子已删除');
      router.push(`/forum/${id}`);
      router.refresh();
    }
  };

  const startTopicEdit = () => {
    if (!topic) return;
    setTopicTitle(topic.title);
    setTopicContent(topic.content);
    setTopicSaveError('');
    setTopicNotice('');
    setEditingTopic(true);
  };

  const cancelTopicEdit = () => {
    setEditingTopic(false);
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

    setSavingTopic(true);
    setTopicSaveError('');
    setTopicNotice('');

    try {
      const { error } = await supabase
        .from('forum_topics')
        .update({ title: nextTitle, content: nextContent })
        .eq('id', topicId);

      if (error) {
        setTopicSaveError(`更新帖子失败：${error.message}`);
        return;
      }

      setTopic((prev) =>
        prev ? { ...prev, title: nextTitle, content: nextContent } : prev
      );
      setEditingTopic(false);
      setTopicNotice('✅ 帖子已更新。');
    } catch (error: unknown) {
      setTopicSaveError(
        error instanceof Error ? `更新帖子失败：${error.message}` : '更新帖子失败，请稍后重试。'
      );
    } finally {
      setSavingTopic(false);
    }
  };

  const startReplyEdit = (reply: ForumReply) => {
    setEditingReplyId(String(reply.id));
    setReplyEditContent(reply.content);
    setReplyError(null);
    setReplyNotice(null);
  };

  const cancelReplyEdit = () => {
    setEditingReplyId(null);
    setReplyEditContent('');
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

    setSavingReplyId(replyId);
    setReplyError(null);
    setReplyNotice(null);

    try {
      const { error } = await supabase
        .from('forum_replies')
        .update({ content: nextContent })
        .eq('id', reply.id);

      if (error) {
        setReplyError({ id: replyId, message: `更新回复失败：${error.message}` });
        return;
      }

      setReplies((prev) =>
        prev.map((item) => (item.id === reply.id ? { ...item, content: nextContent } : item))
      );
      setEditingReplyId(null);
      setReplyEditContent('');
      setReplyNotice({ id: replyId, message: '✅ 回复已更新。' });
    } catch (error: unknown) {
      setReplyError({
        id: replyId,
        message:
          error instanceof Error ? `更新回复失败：${error.message}` : '更新回复失败，请稍后重试。',
      });
    } finally {
      setSavingReplyId(null);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;
  if (!topic) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">帖子不存在或已被删除</div>;

  const canEditTopic =
    !!user && (user.id === topic.author_id || currentLevel >= ROLE_LEVEL.MANAGER);

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
            <Link href="/forum" className="hover:text-white transition">论坛</Link>
            <span>/</span>
            <Link href={`/forum/${id}`} className="hover:text-white transition">{topic.forum_categories?.name || '版块'}</Link>
            <span>/</span>
            <span className="text-gray-400">看帖</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-md">
            {topic.title}
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
            <h3 className="font-bold text-white text-center break-all">{topic.profiles?.display_name || '未知用户'}</h3>
            <p className="text-xs text-blue-400 mt-1">楼主</p>
          </div>
          <div className="flex-1 p-6 md:p-8">
            
            <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-gray-500 mb-6 border-b border-gray-700 pb-4">
              <span>发表于：{new Date(topic.created_at).toLocaleString()}</span>
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                <span>#1</span>
                {canEditTopic && !editingTopic && (
                  <button
                    type="button"
                    onClick={startTopicEdit}
                    disabled={savingTopic}
                    className="text-xs font-bold text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
                  >
                    编辑
                  </button>
                )}
                <Link
                  href={reportHref('topic', String(topic.id))}
                  className="text-xs font-bold text-gray-400 transition hover:text-red-400"
                >
                  举报
                </Link>
                {user && (user.id === topic.author_id || currentLevel >= ROLE_LEVEL.MANAGER) && (
                  <button 
                    onClick={handleDeleteTopic} 
                    className="bg-red-900/30 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded transition border border-red-700/50"
                  >
                    🗑️ 删除帖子
                  </button>
                )}
              </div>
            </div>
            
            {topicNotice && (
              <p role="status" className="mb-4 text-sm font-bold text-green-400">
                {topicNotice}
              </p>
            )}

            {editingTopic ? (
              <form onSubmit={handleSaveTopic} className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="topic-edit-title" className="text-sm font-bold text-gray-400">
                      标题
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
                    placeholder="请输入帖子标题（不超过 120 字）"
                    className="w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <RichTextEditor
                  value={topicContent}
                  onChange={setTopicContent}
                  rows={8}
                  label="正文"
                  placeholder="编辑帖子正文..."
                />

                {topicSaveError && (
                  <p role="alert" className="text-sm font-bold text-red-400">
                    {topicSaveError}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={cancelTopicEdit}
                    disabled={savingTopic}
                    className="rounded border border-gray-600 bg-[#18191c] px-5 py-2 text-sm font-bold text-gray-300 transition hover:border-gray-400 hover:text-white disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={savingTopic}
                    className="rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingTopic ? '保存中...' : '保存修改'}
                  </button>
                </div>
              </form>
            ) : (
              <RichText
                text={topic.content}
                className="text-gray-300 text-base leading-relaxed mb-6"
              />
            )}
            {topic.image_url && (
              <div className="mt-6">
                <img src={topic.image_url} alt="配图" className="max-w-full h-auto rounded-lg border border-gray-700 shadow-md" />
              </div>
            )}
          </div>
        </div>

        {/* 🌟 回复列表区 */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white mb-4 pl-2 border-l-4 border-blue-500">
            全部回复 ({replies.length})
          </h3>
          
          {replies.map((reply, index) => {
            const replyId = String(reply.id);
            const editingThisReply = editingReplyId === replyId;
            const canEditReply =
              !!user &&
              (user.id === reply.author_id || currentLevel >= ROLE_LEVEL.MANAGER);
            const replyBusy = savingReplyId !== null;

            return (
              <div key={reply.id} className="bg-[#2c2d31] border border-gray-700 rounded-lg shadow-lg overflow-hidden flex flex-col md:flex-row">
                <div className="w-full md:w-48 bg-[#232428] p-6 flex flex-col items-center border-b md:border-b-0 md:border-r border-gray-700 shrink-0">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-2 overflow-hidden shadow-md border-2 border-gray-600">
                    {reply.profiles?.avatar_url ? <img src={reply.profiles.avatar_url} className="w-full h-full object-cover" /> : reply.profiles?.display_name?.charAt(0).toUpperCase()}
                  </div>
                  <h4 className="font-bold text-white text-center text-sm break-all">{reply.profiles?.display_name || '未知用户'}</h4>

                  {/* 动态徽章 */}
                  <div className="mt-2 text-center">
                    {reply.profiles?.role === 'developer' && <span className="text-xs font-bold text-red-500">🛠️ 开发者</span>}
                    {reply.profiles?.role === 'senior_manager' && <span className="text-xs font-bold text-orange-400">🧭 高级社区经理</span>}
                    {reply.profiles?.role === 'director' && <span className="text-xs font-bold text-purple-400">👑 论坛总经理</span>}
                    {reply.profiles?.role === 'manager' && <span className="text-xs font-bold text-blue-400">🛡️ 社区经理</span>}
                    {reply.profiles?.role === 'staff' && <span className="text-xs font-bold text-green-400">🔧 工作人员</span>}
                    {reply.profiles?.role === 'community_moderator' && <span className="text-xs font-bold text-cyan-400">🧹 社区版主</span>}
                    {(!reply.profiles?.role || reply.profiles?.role === 'member') && <span className="text-xs text-gray-500">成员</span>}
                  </div>
                </div>
                <div className="flex-1 p-6">
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-4 border-b border-gray-700 pb-3">
                    <span>发表于：{new Date(reply.created_at).toLocaleString()}</span>
                    <span>#{index + 2}</span>
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
                        placeholder="编辑回复内容..."
                      />

                      {replyError?.id === replyId && (
                        <p role="alert" className="text-xs font-bold text-red-400">
                          {replyError.message}
                        </p>
                      )}

                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={cancelReplyEdit}
                          disabled={replyBusy}
                          className="rounded border border-gray-600 bg-[#18191c] px-4 py-1.5 text-xs font-bold text-gray-300 transition hover:border-gray-400 hover:text-white disabled:opacity-50"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          disabled={replyBusy}
                          className="rounded bg-blue-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingReplyId === replyId ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {replyNotice?.id === replyId && (
                        <p role="status" className="mb-2 text-xs font-bold text-green-400">
                          {replyNotice.message}
                        </p>
                      )}
                      <RichText
                        text={reply.content}
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
                        编辑
                      </button>
                    )}
                    <Link
                      href={reportHref('reply', replyId)}
                      className="text-xs font-bold text-gray-400 transition hover:text-red-400"
                    >
                      举报
                    </Link>
                    {!editingThisReply && (
                      <button
                        onClick={() => {
                          setQuoteUser(reply.profiles?.display_name || '未知用户');
                          setQuoteContent(reply.content);
                          document.getElementById('reply-box')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                      >
                        引用回复
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 回复输入框 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-6 shadow-lg mt-8">
          <h3 className="text-lg font-bold text-white mb-4">发表回复</h3>
          {user ? (
            <form onSubmit={handleReply}>
              {quoteUser && (
                <div className="mb-2 p-3 bg-gray-800 border-l-4 border-blue-500 rounded text-sm text-gray-400 relative">
                  <span className="font-bold text-blue-400">正在回复 @{quoteUser}：</span>
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
                  placeholder={quoteUser ? `回复 @${quoteUser}...` : '写下你的看法...'}
                />
              </div>
              <div className="text-right">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded font-bold transition disabled:opacity-50"
                >
                  {submitting ? '发送中...' : '发表回复'}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-400 mb-4">你需要登录后才能参与讨论。</p>
              <Link href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition">去登录</Link>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}