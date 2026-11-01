// app/changelog/page.tsx
'use client';

import { useMemo, useState } from 'react';
import Navbar from '../../components/Navbar';
import { CHANGELOG } from '../../lib/changelog';
import type { ChangeKind, ChangeItem, ChangelogEntry } from '../../lib/changelog';
import { useLocale, useTr } from '@/components/I18nProvider';

// ---------------------------------------------------------------------------
// 页面 UI 英文文案：key 为中文原文，value 为英文译文；英文缺失时自动回退中文。
// 版本条目的 title / items / summary 由 lib/changelog.ts 的 *_en 字段提供，
// 缺失时同样回退中文。
// ---------------------------------------------------------------------------
const EN: Record<string, string> = {
  // 标题区
  '更新日志': 'Version history',
  '记录 RCT MP 网站的每一次更新': 'Every update to the RCT MP site, in one place.',
  '共 {versions} 个版本 · {changes} 条变更，按版本从新到旧排列':
    '{versions} versions · {changes} changes, newest first',

  // 变更类型与筛选栏
  '全部': 'All',
  '新功能': 'New features',
  '修复': 'Fixes',
  '安全': 'Security',
  '其他': 'Other',
  '按变更类型筛选': 'Filter by change type',
  '当前：{filter} · {versions} 个版本 · {changes} 条变更':
    'Showing: {filter} · {versions} versions · {changes} changes',

  // 空状态
  '暂无更新记录': 'No entries yet',
  '没有「{filter}」相关的更新': 'No updates in “{filter}”',
  '新的版本记录会在这里发布，请稍后再来查看。':
    'New releases will be published here — please check back later.',
  '试试切换到「全部」，或选择其它变更类型。':
    'Try “All”, or pick a different change type.',
  '查看全部更新': 'Show all updates',

  // 版本条目
  '最新': 'Latest',
  '变更条目': 'Changes',
  '{count} 条': '{count} items',
  '查看提交': 'View commit',

  // 底部说明
  '更早的版本（0.0.08–0.0.19）以 VTC 功能迭代为主，完整记录见 GitHub 提交历史。':
    'Earlier versions (0.0.08–0.0.19) were mostly VTC feature iterations; see the GitHub commit history for the full record.',
  '在 GitHub 查看提交历史': 'View commit history on GitHub',
};

/** 变更类型 → 中文徽章文案与配色。 */
const KIND_META: Record<ChangeKind, { label: string; badge: string }> = {
  feature: {
    label: '新功能',
    badge: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  },
  fix: {
    label: '修复',
    badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
  security: {
    label: '安全',
    badge: 'border-red-500/40 bg-red-500/15 text-red-300',
  },
  chore: {
    label: '其他',
    badge: 'border-gray-600 bg-[#232428] text-gray-300',
  },
};

type FilterKind = ChangeKind | 'all';

const FILTERS: ReadonlyArray<{ value: FilterKind; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'feature', label: '新功能' },
  { value: 'fix', label: '修复' },
  { value: 'security', label: '安全' },
  { value: 'chore', label: '其他' },
];

const REPO_URL = 'https://github.com/Ozawa-006/roadcruise-mp';

type VisibleEntry = {
  entry: ChangelogEntry;
  items: Array<{ item: ChangeItem; textEn?: string }>;
};

export default function ChangelogPage() {
  const locale = useLocale();
  const isEnglish = locale === 'en';
  const tr = useTr(EN);
  const [filter, setFilter] = useState<FilterKind>('all');

  const totalChanges = CHANGELOG.reduce(
    (sum, entry) => sum + entry.items.length,
    0
  );

  // 筛选时同时过滤版本与版本内的条目：只留下包含该类变更的版本，
  // 并且只展示匹配的条目，避免出现「点进新功能却看到安全条目」的干扰。
  // items_en 与 items 同序，这里先按原索引配对英文，再按类型筛选。
  const visibleEntries = useMemo<VisibleEntry[]>(() => {
    return CHANGELOG.map((entry) => ({
      entry,
      items: entry.items
        .map((item, index) => ({ item, textEn: entry.items_en?.[index] }))
        .filter(({ item }) => filter === 'all' || item.kind === filter),
    })).filter((row) => row.items.length > 0);
  }, [filter]);

  const visibleChanges = visibleEntries.reduce(
    (sum, row) => sum + row.items.length,
    0
  );

  const filterLabel = filter === 'all' ? tr('全部') : tr(KIND_META[filter].label);

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
        {/* 标题区 */}
        <header className="border-b border-gray-700 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-400">
            RCT MP · Site Changelog
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">
              {tr('更新日志')}
            </h1>
            <span className="text-lg font-bold text-gray-500 md:text-xl">
              / Changelog
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            {tr('记录 RCT MP 网站的每一次更新')}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            {tr('共 {versions} 个版本 · {changes} 条变更，按版本从新到旧排列', {
              versions: CHANGELOG.length,
              changes: totalChanges,
            })}
          </p>
        </header>

        {/* 筛选栏 */}
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-700 bg-[#2c2d31] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={tr('按变更类型筛选')}
          >
            {FILTERS.map(({ value, label }) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={active}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    active
                      ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-950/40'
                      : 'border-gray-600 bg-[#232428] text-gray-300 hover:border-blue-500/60 hover:text-white'
                  }`}
                >
                  {tr(label)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500" aria-live="polite">
            {tr('当前：{filter} · {versions} 个版本 · {changes} 条变更', {
              filter: filterLabel,
              versions: visibleEntries.length,
              changes: visibleChanges,
            })}
          </p>
        </div>

        {/* 时间线 / 空状态 */}
        {visibleEntries.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-10 text-center md:p-14">
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
                  d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
                />
              </svg>
            </div>
            <p className="mt-4 text-base font-bold text-white">
              {filter === 'all'
                ? tr('暂无更新记录')
                : tr('没有「{filter}」相关的更新', { filter: filterLabel })}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {filter === 'all'
                ? tr('新的版本记录会在这里发布，请稍后再来查看。')
                : tr('试试切换到「全部」，或选择其它变更类型。')}
            </p>
            {filter !== 'all' ? (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {tr('查看全部更新')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="relative mt-8">
            {/* 时间线竖线：移动端靠左，桌面端位于版本列与条目列之间 */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-[7px] w-px bg-gradient-to-b from-blue-500/60 via-gray-700 to-transparent md:left-[11.5rem]"
            />

            <ol className="flex flex-col gap-6 md:gap-8">
              {visibleEntries.map(({ entry, items }) => {
                const highlighted = entry.highlight === true;
                const title = isEnglish
                  ? entry.title_en ?? entry.title
                  : entry.title;
                const summary = isEnglish
                  ? entry.summary_en ?? entry.summary
                  : entry.summary;

                return (
                  <li
                    key={entry.version}
                    className="relative pl-9 md:grid md:grid-cols-[10.5rem_minmax(0,1fr)] md:gap-8 md:pl-0"
                  >
                    {/* 时间线节点 */}
                    <span
                      aria-hidden="true"
                      className={`absolute left-[7px] top-2 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-[#18191c] md:left-[11.5rem] ${
                        highlighted ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                    />

                    {/* 左列：版本 / 日期 / 标题 */}
                    <div className="mb-3 md:mb-0 md:pr-1 md:text-right">
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <span className="inline-flex items-center rounded border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 font-mono text-sm font-bold text-blue-300">
                          {entry.version}
                        </span>
                        {highlighted ? (
                          <span className="inline-flex items-center rounded bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">
                            {tr('最新')}
                          </span>
                        ) : null}
                      </div>
                      <time
                        className="mt-2 block font-mono text-xs text-gray-500"
                        dateTime={entry.date}
                      >
                        {entry.date}
                      </time>
                      <h2 className="mt-1 text-base font-bold text-white md:text-lg">
                        {title}
                      </h2>
                    </div>

                    {/* 右列：条目卡片 */}
                    <article
                      className={`rounded-xl border bg-[#2c2d31] p-4 shadow-lg shadow-black/20 md:p-5 ${
                        highlighted
                          ? 'border-blue-500/60 ring-1 ring-blue-500/20'
                          : 'border-gray-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/70 pb-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          {tr('变更条目')}
                        </p>
                        <span className="text-xs text-gray-500">
                          {tr('{count} 条', { count: items.length })}
                        </span>
                      </div>

                      {summary ? (
                        <p className="mt-3 text-sm leading-6 text-gray-400">
                          {summary}
                        </p>
                      ) : null}

                      <ul className="mt-3 flex flex-col gap-3">
                        {items.map(({ item, textEn }, index) => {
                          const meta = KIND_META[item.kind];
                          const text = isEnglish ? textEn ?? item.text : item.text;
                          return (
                            <li
                              key={`${entry.version}-${index}`}
                              className="flex items-start gap-3"
                            >
                              <span
                                className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded border px-2 text-[11px] font-bold ${meta.badge}`}
                              >
                                {tr(meta.label)}
                              </span>
                              <p className="min-w-0 text-sm leading-6 text-gray-300">
                                {text}
                              </p>
                            </li>
                          );
                        })}
                      </ul>

                      {entry.commit ? (
                        <div className="mt-4 flex justify-end border-t border-gray-700/70 pt-3">
                          <a
                            href={`${REPO_URL}/commit/${entry.commit}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded text-xs font-bold text-blue-400 transition hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          >
                            {tr('查看提交')}
                            <span className="font-mono text-gray-500">
                              {entry.commit}
                            </span>
                            <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* 底部说明 */}
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-gray-700 bg-[#111111] p-6 text-center">
          <p className="max-w-2xl text-sm leading-6 text-gray-400">
            {tr('更早的版本（0.0.08–0.0.19）以 VTC 功能迭代为主，完整记录见 GitHub 提交历史。')}
          </p>
          <a
            href={`${REPO_URL}/commits/main`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-[#2c2d31] px-4 py-2 text-sm font-bold text-gray-200 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {tr('在 GitHub 查看提交历史')}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </main>
  );
}
