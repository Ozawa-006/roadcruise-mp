// app/admin/rules/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canEditRules, levelOf, roleLabelFromLevel } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** rules_articles 行（admin 列表与编辑表单使用；英文列可为 null）。 */
type RuleArticle = {
  id: number;
  section: string;
  article_number: string | number;
  title: string | null;
  title_en: string | null;
  content: string | null;
  content_en: string | null;
  penalty: string | null;
  penalty_en: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type EnCoverage = 'full' | 'partial' | 'zh';

/**
 * 英文覆盖度：标题/正文必填，处罚在中/英文任一有内容时计入（处罚本身可选）。
 * - full：所有存在的字段都有英文
 * - partial：部分字段有英文
 * - zh：完全没有英文
 */
function enCoverage(article: RuleArticle): EnCoverage {
  const fields = [
    { zh: article.title, en: article.title_en },
    { zh: article.content, en: article.content_en },
  ];
  if (article.penalty?.trim() || article.penalty_en?.trim()) {
    fields.push({ zh: article.penalty, en: article.penalty_en });
  }
  const translated = fields.filter(
    (field) => Boolean(field.zh?.trim()) && Boolean(field.en?.trim())
  ).length;
  if (translated === 0) return 'zh';
  return translated === fields.length ? 'full' : 'partial';
}

const EN_BADGE: Record<EnCoverage, { label: string; className: string }> = {
  full: { label: 'EN 完整', className: 'border-green-500/40 bg-green-500/15 text-green-300' },
  partial: { label: 'EN 部分', className: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  zh: { label: '仅中文', className: 'border-gray-600 bg-[#232428] text-gray-400' },
};

export default function AdminRulesPage() {
  const [userLevel, setUserLevel] = useState<number>(0);
  const [articles, setArticles] = useState<RuleArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [section, setSection] = useState('§1 - 服务总则');
  const [articleNumber, setArticleNumber] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [penalty, setPenalty] = useState('');
  const [status, setStatus] = useState('draft');

  // 英文内容（选填）：留空保存为 null，英文界面回退中文。
  const [titleEn, setTitleEn] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [penaltyEn, setPenaltyEn] = useState('');

  const fetchArticles = async () => {
    const { data } = await supabase
      .from('rules_articles')
      .select('*')
      .order('section', { ascending: true })
      .order('article_number', { ascending: true });
    if (data) setArticles(data as RuleArticle[]);
  };

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');

      const { data: profile } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
      const level = levelOf(profile?.role_level);

      // 规则编辑统一为 Lv.90 高级社区经理及以上（不再使用自建权重 / 邮箱提权）
      if (!canEditRules(level)) {
        alert('🚫 权限不足：只有高级社区经理 (Lv.90) 及以上级别才能编辑规则。');
        router.push('/admin');
        return;
      }
      setUserLevel(level);
      await fetchArticles();
      setLoading(false);
    };
    checkAuthAndLoad();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const articleData = {
      section,
      article_number: articleNumber,
      title,
      title_en: titleEn.trim() || null,
      content,
      content_en: contentEn.trim() || null,
      penalty,
      penalty_en: penaltyEn.trim() || null,
      status,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingId) {
      const { error: updateError } = await supabase.from('rules_articles').update(articleData).eq('id', editingId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('rules_articles').insert([articleData]);
      error = insertError;
    }

    if (error) {
      setMsg(`保存失败: ${error.message}`);
    } else {
      setMsg('🎉 规则已保存！');
      resetForm();
      await fetchArticles();
    }
    setSaving(false);
  };

  const handleEdit = (article: RuleArticle) => {
    setEditingId(article.id);
    setSection(article.section);
    setArticleNumber(String(article.article_number));
    setTitle(article.title ?? '');
    setTitleEn(article.title_en ?? '');
    setContent(article.content ?? '');
    setContentEn(article.content_en ?? '');
    setPenalty(article.penalty ?? '');
    setPenaltyEn(article.penalty_en ?? '');
    setStatus(article.status);
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('⚠️ 确定要删除这条规则吗？此操作不可恢复！')) return;
    const { error } = await supabase.from('rules_articles').delete().eq('id', id);
    if (error) {
      alert('删除失败：' + error.message);
    } else {
      await fetchArticles();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setSection('§1 - 服务总则');
    setArticleNumber('');
    setTitle('');
    setTitleEn('');
    setContent('');
    setContentEn('');
    setPenalty('');
    setPenaltyEn('');
    setStatus('draft');
    setMsg('');
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">验证权限中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">📜 社区规则管理</h1>
            <p className="text-xs text-gray-500 mt-1">当前身份：{roleLabelFromLevel(userLevel)} (Lv.{userLevel})</p>
          </div>
          <Link href="/admin" className="text-blue-400 hover:underline text-sm">返回控制台</Link>
        </div>

        <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4">{editingId ? '编辑规则条款' : '新增规则条款'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">章节</label>
                <input type="text" value={section} onChange={(e) => setSection(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="例如：§1 - 服务总则" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">条款编号</label>
                <input type="text" value={articleNumber} onChange={(e) => setArticleNumber(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="例如：§1.1" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">状态</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white">
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">标题</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="例如：账号与设备责任" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">规则内容</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white h-24" placeholder="详细规则描述..." required ></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">处罚说明 (选填)</label>
              <input type="text" value={penalty} onChange={(e) => setPenalty(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="例如：90天封禁" />
            </div>

            {/* 英文字段（选填）：留空保存为 null，英文界面自动回退中文 */}
            <div className="space-y-4 rounded-md border border-gray-700 bg-[#232428]/60 p-4">
              <div>
                <h3 className="text-xs font-bold text-gray-300">英文内容（选填 · 英文界面优先显示）</h3>
                <p className="mt-1 text-[11px] text-gray-500">留空时英文界面回退中文。</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">标题（英文）</label>
                <input type="text" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="English title (optional)" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">正文（英文）</label>
                <textarea value={contentEn} onChange={(e) => setContentEn(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white h-24" placeholder="English content (optional)" ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">处罚（英文）</label>
                <input type="text" value={penaltyEn} onChange={(e) => setPenaltyEn(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="e.g. 90-day ban (optional)" />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold text-sm disabled:opacity-50">
                {saving ? '保存中...' : editingId ? '更新条款' : '添加条款'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded font-bold text-sm">
                  取消编辑
                </button>
              )}
            </div>
            {msg && <p className="text-green-400 text-sm font-bold">{msg}</p>}
          </form>
        </div>

        <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg overflow-hidden">
          <div className="bg-[#232428] px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-400">现有规则列表 (共 {articles.length} 条)</h2>
            <span className="text-[11px] text-gray-500">标题优先显示英文；EN 标记表示英文翻译完整度</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#18191c] text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-3">章节</th>
                  <th className="px-4 py-3">编号</th>
                  <th className="px-4 py-3">标题</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {articles.map((article) => {
                  const badge = EN_BADGE[enCoverage(article)];
                  const displayTitle =
                    article.title_en?.trim() || article.title?.trim() || '（无标题）';
                  return (
                    <tr key={article.id} className="hover:bg-[#3a3b40] transition">
                      <td className="px-4 py-3 text-gray-400">{article.section}</td>
                      <td className="px-4 py-3 font-mono text-blue-400">{article.article_number}</td>
                      <td className="px-4 py-3 text-white">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{displayTitle}</span>
                          <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${article.status === 'published' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                          {article.status === 'published' ? '已发布' : '草稿'}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-3">
                        <button onClick={() => handleEdit(article)} className="text-blue-400 hover:text-blue-300 text-xs font-bold">编辑</button>
                        <button onClick={() => handleDelete(article.id)} className="text-red-400 hover:text-red-300 text-xs font-bold">删除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}