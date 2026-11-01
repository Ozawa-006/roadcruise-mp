'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; 
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';
import Link from 'next/link';
import { ROLE_LEVEL, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TopicDetailPage() {
  const [quoteUser, setQuoteUser] = useState('');
  const [quoteContent, setQuoteContent] = useState('');
  const { id, topicId } = useParams(); 
  const router = useRouter();
  
  const [topic, setTopic] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 用户与权限状态
  const [user, setUser] = useState<any>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(0);
  
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      finalContent = `> 引用 @${quoteUser} 的发言：\n> ${quoteContent}\n\n${replyContent}`;
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

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;
  if (!topic) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">帖子不存在或已被删除</div>;

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
            
            <div className="flex justify-between items-center text-xs text-gray-500 mb-6 border-b border-gray-700 pb-4">
              <span>发表于：{new Date(topic.created_at).toLocaleString()}</span>
              <div className="flex items-center gap-4">
                <span>#1</span>
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
            
            <div className="text-gray-300 text-base leading-relaxed whitespace-pre-wrap mb-6">
              {topic.content}
            </div>
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
          
          {replies.map((reply, index) => (
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
                
                <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mb-4">
                  {reply.content}
                </div>
                
                <div className="flex justify-end pt-2 border-t border-gray-700/50">
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
                </div>
              </div>
            </div>
          ))}
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

              <textarea 
                id="reply-box"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-32 focus:outline-none focus:border-blue-500 mb-4"
                placeholder={quoteUser ? `回复 @${quoteUser}...` : "写下你的看法..."}
                required
              ></textarea>
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