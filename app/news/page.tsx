'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 10;
const SUMMARY_LENGTH = 120;

type Announcement = {
  id: number;
  title: string | null;
  content: string | null;
  type: string | null;
  image_url: string | null;
  link_url: string | null;
  created_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleDateString('zh-CN');
}

/** 去掉正文中的换行与连续空白后截断，用于列表摘要。 */
function summarize(content: string | null): string {
  if (!content) return '';
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > SUMMARY_LENGTH
    ? `${flat.slice(0, SUMMARY_LENGTH)}…`
    : flat;
}

function badgeClass(type: string | null): string {
  if (type === '新闻') {
    return 'border-orange-500/40 bg-orange-500/15 text-orange-300';
  }
  if (type === '公告') {
    return 'border-blue-500/40 bg-blue-500/15 text-blue-300';
  }
  return 'border-gray-600 bg-[#232428] text-gray-300';
}

function LoadingState() {
  return (
    <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      <p className="mt-4 text-sm text-gray-400">正在获取新闻公告…</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-900/60 bg-[#2c2d31] p-8 text-center md:p-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 font-mono text-lg font-bold text-red-300">
        !
      </div>
      <p className="mt-4 text-lg font-bold text-white">加载失败，请稍后重试</p>
      <p className="mt-2 text-sm text-gray-500">
        暂时无法获取新闻公告列表，请检查网络后重试。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        重新加载
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-10 text-center md:p-14">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-700 bg-[#232428]">
        <svg
          className="h-7 w-7 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4 5h11a1 1 0 0 1 1 1v12a1 1 0 0 0 1 1H5a1 1 0 0 1-1-1V5Zm0 9h13M7 8h5m-5 3h3"
          />
        </svg>
      </div>
      <p className="mt-4 text-base font-bold text-white">暂无新闻公告</p>
      <p className="mt-2 text-sm text-gray-500">
        新的公告与新闻会在这里发布，请稍后再来查看。
      </p>
    </div>
  );
}

export default function NewsListPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFailed(false);

      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('id,title,content,type,image_url,link_url,created_at')
          .order('created_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          console.error('加载新闻公告失败:', error);
          setItems([]);
          setFailed(true);
        } else {
          setItems((data ?? []) as Announcement[]);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('加载新闻公告失败:', error);
        setItems([]);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [items, currentPage]
  );

  const retry = () => {
    setPage(1);
    setReloadToken((value) => value + 1);
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 border-b border-gray-700 pb-5 md:mb-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">
              新闻公告
            </h1>
            <span className="text-lg font-bold text-gray-500 md:text-xl">/ News</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            RCT MP 社区的最新公告、版本更新与活动资讯都会在这里发布。
          </p>
          {!loading && !failed && items.length > 0 ? (
            <p className="mt-2 text-xs text-gray-600">共 {items.length} 条 · 每页 {PAGE_SIZE} 条</p>
          ) : null}
        </div>

        {loading ? (
          <LoadingState />
        ) : failed ? (
          <ErrorState onRetry={retry} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="space-y-4">
              {pageItems.map((item) => {
                const type = item.type?.trim() || '公告';
                const title = item.title?.trim() || '未命名公告';
                const summary = summarize(item.content);

                return (
                  <Link
                    key={item.id}
                    href={`/news/${item.id}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-gray-700 bg-[#2c2d31] shadow-lg shadow-black/20 transition hover:border-blue-500/60 hover:bg-[#313237] sm:flex-row"
                  >
                    {item.image_url ? (
                      <div className="h-44 w-full shrink-0 overflow-hidden bg-[#232428] sm:h-auto sm:w-52">
                        <img
                          src={item.image_url}
                          alt={title}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      </div>
                    ) : null}

                    <div className="flex min-w-0 flex-1 flex-col p-5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          className={`inline-flex items-center rounded border px-2.5 py-0.5 text-[11px] font-bold ${badgeClass(
                            type
                          )}`}
                        >
                          {type}
                        </span>
                        <time
                          className="text-xs text-gray-500"
                          dateTime={item.created_at ?? undefined}
                        >
                          {formatDate(item.created_at)}
                        </time>
                      </div>

                      <h2 className="mt-3 line-clamp-2 text-lg font-bold text-white transition group-hover:text-blue-400 md:text-xl">
                        {title}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-400">
                        {summary || '暂无正文内容。'}
                      </p>
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-400 transition group-hover:text-blue-300">
                        阅读全文
                        <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 ? (
              <nav
                className="mt-8 flex flex-wrap items-center justify-center gap-3"
                aria-label="新闻公告分页"
              >
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600 disabled:hover:border-gray-700"
                >
                  上一页
                </button>
                <span className="text-sm text-gray-500">
                  第{' '}
                  <span className="font-mono text-gray-200">{currentPage}</span> /{' '}
                  <span className="font-mono text-gray-400">{totalPages}</span> 页
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600 disabled:hover:border-gray-700"
                >
                  下一页
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
