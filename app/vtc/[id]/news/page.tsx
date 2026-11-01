// app/vtc/[id]/news/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../../components/Navbar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 只读视图的正文截断长度（约 200 字）
const SUMMARY_LENGTH = 200;

const PERMISSION_HINT = '仅该车队的队长 / 副队长可以管理车队新闻。';

interface VtcInfo {
  id: number;
  name: string | null;
  tag: string | null;
  logo_url: string | null;
  owner_id: string | null;
}

interface AuthorEmbed {
  display_name: string | null;
}

interface VtcNewsRow {
  id: number;
  vtc_id: number;
  author_id: string | null;
  title: string | null;
  content: string | null;
  created_at: string | null;
  updated_at: string | null;
  profiles?: AuthorEmbed | AuthorEmbed[] | null;
}

interface VtcNewsItem {
  id: number;
  title: string;
  content: string;
  authorId: string | null;
  authorName: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface MyProfileRow {
  vtc_id: number | null;
  vtc_role: string | null;
}

interface AuthorProfileRow {
  id: string;
  display_name: string | null;
}

/** 优先取 Supabase / PostgREST 的 error.message，取不到再用兜底文案。 */
function errorMessageOf(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}

/** 写操作错误文案：权限类错误额外给出中文提示，原始 message 始终保留。 */
function writeErrorMessage(action: string, error: unknown): string {
  const message = errorMessageOf(error, '操作失败，请稍后重试');
  const lower = message.toLowerCase();
  const isPermissionError =
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('42501') ||
    lower.includes('jwt');
  if (isPermissionError) {
    return `${action}失败：数据库拒绝了本次操作（${message}）。${PERMISSION_HINT}`;
  }
  return `${action}失败：${message}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleString('zh-CN');
}

/** 兼容 embed 返回对象或数组两种形态；embed 不可用时用二次查询的昵称兜底。 */
function authorNameOf(
  embed: AuthorEmbed | AuthorEmbed[] | null | undefined,
  names: Record<string, string>,
  authorId: string | null
): string {
  const row = Array.isArray(embed) ? embed[0] : embed;
  const embedded = row?.display_name?.trim();
  if (embedded) return embedded;
  if (authorId && names[authorId]) return names[authorId];
  return '未知作者';
}

function toNewsItem(row: VtcNewsRow, names: Record<string, string>): VtcNewsItem {
  return {
    id: row.id,
    title: row.title ?? '',
    content: row.content ?? '',
    authorId: row.author_id ?? null,
    authorName: authorNameOf(row.profiles, names, row.author_id ?? null),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export default function VtcNewsPage() {
  const params = useParams();
  const rawId = params?.id;
  const vtcId = typeof rawId === 'string' ? rawId : '';

  const [vtc, setVtc] = useState<VtcInfo | null>(null);
  const [items, setItems] = useState<VtcNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isManager, setIsManager] = useState(false);

  // 发布 / 编辑表单
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  // 行内操作与展开状态
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);

  const formRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(
    async (initial: boolean) => {
      const numericId = Number(vtcId);
      if (!vtcId || !Number.isInteger(numericId) || numericId <= 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (initial) setLoading(true);
      setNotFound(false);
      setLoadError('');

      try {
        // 当前登录用户（未登录时为 null，公开列表仍可读）
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        // 本人车队归属：用于判定副队长
        let profileVtcId: number | null = null;
        let profileRole: string | null = null;
        if (currentUser) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('vtc_id, vtc_role')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (profileError) {
            console.error('读取本人车队身份失败:', profileError);
          } else {
            const profileRow = profileData as unknown as MyProfileRow | null;
            profileVtcId = profileRow?.vtc_id ?? null;
            profileRole = profileRow?.vtc_role ?? null;
          }
        }

        // 车队主体信息
        const { data: vtcData, error: vtcError } = await supabase
          .from('vtcs')
          .select('id, name, tag, logo_url, owner_id')
          .eq('id', numericId)
          .maybeSingle();

        if (vtcError) {
          setLoadError(`加载车队信息失败：${vtcError.message}`);
          setVtc(null);
          setItems([]);
          setIsManager(false);
          return;
        }
        if (!vtcData) {
          setNotFound(true);
          setVtc(null);
          setItems([]);
          setIsManager(false);
          return;
        }

        const info = vtcData as unknown as VtcInfo;
        setVtc(info);
        const manager =
          !!currentUser &&
          (info.owner_id === currentUser.id ||
            (profileVtcId === info.id && profileRole === 'vice_owner'));
        setIsManager(manager);

        // 新闻列表：优先用 profiles embed 取作者昵称
        const authorNames: Record<string, string> = {};
        let rows: VtcNewsRow[] = [];
        let authorFallbackFailed = '';

        const { data: newsData, error: newsError } = await supabase
          .from('vtc_news')
          .select(
            'id, vtc_id, author_id, title, content, created_at, updated_at, profiles!author_id(display_name)'
          )
          .eq('vtc_id', numericId)
          .order('created_at', { ascending: false });

        if (!newsError) {
          rows = (newsData ?? []) as unknown as VtcNewsRow[];
        } else {
          // embed 不可用（关系未暴露等）时退化为二次查询 profiles
          console.error('读取车队新闻（含作者 embed）失败，改用二次查询:', newsError);

          const { data: plainData, error: plainError } = await supabase
            .from('vtc_news')
            .select('id, vtc_id, author_id, title, content, created_at, updated_at')
            .eq('vtc_id', numericId)
            .order('created_at', { ascending: false });

          if (plainError) {
            authorFallbackFailed = plainError.message;
          } else {
            rows = ((plainData ?? []) as unknown as VtcNewsRow[]).map((row) => ({
              ...row,
              profiles: null,
            }));

            const authorIds = Array.from(
              new Set(
                rows
                  .map((row) => row.author_id)
                  .filter((value): value is string => typeof value === 'string' && value.length > 0)
              )
            );

            if (authorIds.length > 0) {
              const { data: profileRows, error: profileListError } = await supabase
                .from('profiles')
                .select('id, display_name')
                .in('id', authorIds);

              if (profileListError) {
                console.error('读取新闻作者昵称失败:', profileListError);
              } else {
                for (const profile of (profileRows ?? []) as unknown as AuthorProfileRow[]) {
                  authorNames[profile.id] = profile.display_name?.trim() || '未知作者';
                }
              }
            }
          }
        }

        if (authorFallbackFailed) {
          setLoadError(`加载车队新闻失败：${authorFallbackFailed}`);
          setItems([]);
        } else {
          setItems(rows.map((row) => toNewsItem(row, authorNames)));
        }
      } catch (error: unknown) {
        setLoadError(`加载车队新闻失败：${errorMessageOf(error, '请稍后重试')}`);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [vtcId]
  );

  useEffect(() => {
    // 在 effect 内启动请求，setState 只发生在 await 之后，不做同步级联更新
    (async () => {
      await loadPage(true);
    })();
  }, [loadPage]);

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitle('');
    setContent('');
    setFormError('');
  };

  const toggleForm = () => {
    if (formOpen) {
      resetForm();
      return;
    }
    setEditingId(null);
    setTitle('');
    setContent('');
    setFormError('');
    setFormOpen(true);
  };

  const startEdit = (item: VtcNewsItem) => {
    setNotice('');
    setFormError('');
    setEditingId(item.id);
    setTitle(item.title);
    setContent(item.content);
    setFormOpen(true);
    // 等表单渲染后再滚动到表单
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vtc) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('请填写新闻标题。');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setNotice('');

    try {
      if (editingId !== null) {
        const { error } = await supabase
          .from('vtc_news')
          .update({ title: trimmedTitle, content })
          .eq('id', editingId)
          .eq('vtc_id', vtc.id);

        if (error) throw error;
        setNotice('✅ 车队新闻已更新。');
      } else {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          setFormError('请先登录后再发布新闻。');
          return;
        }

        const { error } = await supabase.from('vtc_news').insert({
          vtc_id: vtc.id,
          author_id: currentUser.id,
          title: trimmedTitle,
          content,
        });

        if (error) throw error;
        setNotice('✅ 车队新闻已发布。');
      }

      resetForm();
      await loadPage(false);
    } catch (error: unknown) {
      setFormError(writeErrorMessage(editingId !== null ? '更新' : '发布', error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: VtcNewsItem) => {
    if (!vtc) return;
    const label = item.title.trim() || '未命名新闻';
    if (!window.confirm(`确定删除新闻「${label}」吗？删除后无法恢复。`)) return;

    setRowBusyId(item.id);
    setLoadError('');
    setNotice('');

    try {
      const { error } = await supabase
        .from('vtc_news')
        .delete()
        .eq('id', item.id)
        .eq('vtc_id', vtc.id);

      if (error) throw error;

      if (editingId === item.id) resetForm();
      setNotice('🗑️ 已删除该条车队新闻。');
      await loadPage(false);
    } catch (error: unknown) {
      setLoadError(writeErrorMessage('删除', error));
    } finally {
      setRowBusyId(null);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const inputClass =
    'w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center font-sans">
        加载车队新闻中...
      </div>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 flex flex-col justify-center items-center gap-4 px-4">
          <p className="text-4xl">🚛</p>
          <h1 className="text-xl font-bold text-white">车队不存在</h1>
          <p className="text-sm text-gray-500">该车队可能已被解散，或链接有误。</p>
          <Link
            href="/vtc"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition"
          >
            返回车队大厅
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-6 md:py-10 space-y-6">
        {/* 车队信息 + 返回入口 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-16 h-16 bg-[#18191c] rounded-lg border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center shadow-md">
              {vtc?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vtc.logo_url} alt={vtc.name || '车队 Logo'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">🏢</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-black text-white">车队新闻</h1>
                {vtc?.tag && (
                  <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded font-mono border border-blue-800">
                    [{vtc.tag}]
                  </span>
                )}
                {isManager && (
                  <span className="text-xs bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded font-bold border border-orange-800">
                    管理层
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {vtc ? (
                  <>
                    <Link
                      href={`/vtc/${vtc.id}`}
                      className="font-bold text-blue-400 hover:text-blue-300 transition"
                    >
                      {vtc.name || '未命名车队'}
                    </Link>{' '}
                    的车队公告与动态
                  </>
                ) : (
                  '车队公告与动态'
                )}
              </p>
            </div>

            {!loading && (
              <span className="text-xs text-gray-500 shrink-0">共 {items.length} 条新闻</span>
            )}
          </div>

          <div className="px-5 md:px-6 py-3 bg-[#232428] border-t border-gray-700/60 flex flex-wrap items-center gap-3">
            <Link
              href={`/vtc/${vtcId}`}
              className="text-sm font-bold text-gray-300 hover:text-white transition"
            >
              ← 返回车队
            </Link>
            <span className="text-xs text-gray-600 hidden md:inline">
              {isManager ? '你可以发布、编辑和删除本队新闻。' : '仅车队管理层可发布新闻，其他玩家只读。'}
            </span>
            <Link
              href="/vtc"
              className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition font-bold"
            >
              车队大厅
            </Link>
          </div>
        </div>

        {/* 页面级提示 */}
        {notice && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded text-sm font-bold">
            {notice}
          </div>
        )}
        {loadError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded text-sm font-bold break-words">
            {loadError}
          </div>
        )}

        {/* 管理层：发布 / 编辑表单 */}
        {isManager && (
          <div
            ref={formRef}
            className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden scroll-mt-24"
          >
            <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M2 5a2 2 0 012-2h8a2 2 0 012 2v2h2a2 2 0 012 2v3a2 2 0 01-2 2h-2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm12 9h2a1 1 0 001-1V9a1 1 0 00-1-1h-2v6zM4 7a1 1 0 011-1h2a1 1 0 010 2H5a1 1 0 01-1-1zm1 3a1 1 0 000 2h2a1 1 0 100-2H5zm0 4a1 1 0 100 2h2a1 1 0 100-2H5z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-bold text-gray-400">
                  {editingId !== null ? '编辑车队新闻' : '发布车队新闻'}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleForm}
                disabled={submitting}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 transition disabled:opacity-50"
              >
                {formOpen ? '收起' : '发布车队新闻 →'}
              </button>
            </div>

            {formOpen && (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {editingId !== null && (
                  <p className="text-xs text-orange-400 font-bold bg-orange-900/20 border border-orange-800 rounded px-3 py-2">
                    正在编辑已有新闻，保存后将直接更新原文。
                  </p>
                )}

                <div>
                  <label htmlFor="vtc-news-title" className="block text-sm font-bold text-gray-400 mb-2">
                    新闻标题 *
                  </label>
                  <input
                    id="vtc-news-title"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    required
                    placeholder="例如：本周车队联运与考核安排"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="vtc-news-content" className="block text-sm font-bold text-gray-400 mb-2">
                    正文（纯文本）
                  </label>
                  <textarea
                    id="vtc-news-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    rows={8}
                    placeholder="支持换行，暂不支持 Markdown / HTML。"
                    className={`${inputClass} leading-relaxed resize-y`}
                  />
                  <p className="mt-1 text-xs text-gray-500">当前 {content.length} 字</p>
                </div>

                {formError && <p className="text-xs text-red-400 font-bold break-words">{formError}</p>}

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-700">
                  <button
                    type="submit"
                    disabled={submitting || !title.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg disabled:opacity-50"
                  >
                    {submitting ? '提交中...' : editingId !== null ? '保存修改' : '发布新闻'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={submitting}
                    className="text-sm text-gray-400 hover:text-white font-bold transition disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* 新闻列表 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M2 5a2 2 0 012-2h8a2 2 0 012 2v2h2a2 2 0 012 2v3a2 2 0 01-2 2h-2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm12 9h2a1 1 0 001-1V9a1 1 0 00-1-1h-2v6zM4 7a1 1 0 011-1h2a1 1 0 010 2H5a1 1 0 01-1-1zm1 3a1 1 0 000 2h2a1 1 0 100-2H5zm0 4a1 1 0 100 2h2a1 1 0 100-2H5z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-bold text-gray-400">全部新闻</span>
            </div>
            <span className="text-xs text-gray-500">按发布时间倒序</span>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-14 px-6">
              <p className="text-4xl">📰</p>
              <p className="mt-3 text-base font-bold text-white">暂无车队新闻</p>
              <p className="mt-2 text-sm text-gray-500">
                {isManager
                  ? '点击上方「发布车队新闻」，为本队发布第一条公告。'
                  : '该车队还没有发布新闻，请稍后再来看看。'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-700/60">
              {items.map((item) => {
                const expanded = expandedIds.includes(item.id);
                // 按 Unicode 码点截断，避免把 emoji 的代理对切断
                const chars = Array.from(item.content);
                const tooLong = chars.length > SUMMARY_LENGTH;
                const body = isManager || expanded || !tooLong
                  ? item.content
                  : `${chars.slice(0, SUMMARY_LENGTH).join('')}…`;
                const edited =
                  Boolean(item.updatedAt) &&
                  Boolean(item.createdAt) &&
                  item.updatedAt !== item.createdAt;
                const busy = rowBusyId !== null || submitting;

                return (
                  <li
                    key={item.id}
                    className={`p-5 md:p-6 transition ${
                      editingId === item.id ? 'bg-[#232428]' : 'hover:bg-[#232428]/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold text-white break-words">
                          {item.title.trim() || '未命名新闻'}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>✍️ {item.authorName}</span>
                          <time dateTime={item.createdAt ?? undefined}>
                            {formatDateTime(item.createdAt)}
                          </time>
                          {edited && (
                            <span className="text-gray-600" title={formatDateTime(item.updatedAt)}>
                              已编辑
                            </span>
                          )}
                        </div>
                      </div>

                      {isManager && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            disabled={busy}
                            className="bg-[#18191c] border border-gray-600 hover:border-blue-500 hover:text-blue-400 text-gray-300 px-3 py-1.5 rounded text-xs font-bold transition disabled:opacity-50"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={busy}
                            className="bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800 px-3 py-1.5 rounded text-xs font-bold transition disabled:opacity-50"
                          >
                            {rowBusyId === item.id ? '删除中...' : '删除'}
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-gray-300 whitespace-pre-wrap break-words">
                      {body || '（无正文）'}
                    </p>

                    {!isManager && tooLong && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.id)}
                        className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition"
                      >
                        {expanded ? '收起' : '展开'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="pb-2 text-center">
          <Link
            href={`/vtc/${vtcId}`}
            className="text-sm font-bold text-gray-400 hover:text-white transition"
          >
            ← 返回车队主页
          </Link>
        </div>
      </div>
    </main>
  );
}
