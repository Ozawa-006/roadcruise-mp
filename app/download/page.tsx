// app/download/page.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';

export const metadata: Metadata = {
  title: '客户端下载',
  description:
    'RCT MP 启动器仍在内部测试，正式发布后将在此页面提供官方下载。当前可查看服务器开放状态与更新公告。',
  alternates: { canonical: '/download' },
};

type LauncherFeature = {
  title: string;
  status: '测试中' | '规划中';
  description: string;
  icon: ReactNode;
};

const FEATURE_STATUS_STYLES: Record<LauncherFeature['status'], string> = {
  测试中: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  规划中: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
};

const FEATURES: readonly LauncherFeature[] = [
  {
    title: 'Steam 登录',
    status: '测试中',
    description: '使用 Steam 账号完成身份验证，无需在启动器内额外保存密码。',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M15 7a3 3 0 11-6 0 3 3 0 016 0zm-3 4v5m-5 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H7a2 2 0 00-2 2v4a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    title: '服务器选择',
    status: '规划中',
    description: '查看 RCT MP 服务器列表与在线状态，选择要进入的服务器。',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
        />
      </svg>
    ),
  },
  {
    title: '一键进入联运',
    status: '规划中',
    description: '从启动器直接启动 ETS2 并进入联运，减少手动配置步骤。',
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
];

const CONFIRMED_REQUIREMENTS = [
  { label: '操作系统', value: 'Windows 10 / 11' },
  { label: '游戏本体', value: '《欧洲卡车模拟2》正版（Steam）' },
  { label: '账号', value: 'Steam 账号' },
] as const;

const PENDING_REQUIREMENTS = ['处理器', '内存', '显卡', '存储空间', '网络'] as const;

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-bold text-blue-400 underline decoration-blue-500/30 underline-offset-2 transition hover:text-blue-300"
    >
      {children}
    </Link>
  );
}

export default function DownloadPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <header className="border-b border-gray-700 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange-400">
            RCT MP · Launcher
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">
              客户端下载
            </h1>
            <span className="text-lg font-bold text-gray-500 md:text-xl">/ Download</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              测试中 · 即将开放
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            RCT MP 启动器仍在内部测试，正式发布后此处会提供官方下载。当前可以先通过服务器列表查看服务器状态；客户端与服务器将在测试完成后开放。
          </p>
        </header>

        <section
          aria-labelledby="download-status"
          className="mt-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-[#2c2d31]"
        >
          <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-5 py-5 md:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="download-status" className="text-xl font-black text-white md:text-2xl">
                暂无可用安装包
              </h2>
              <span className="rounded-full border border-amber-500/30 bg-[#232428] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                Coming Soon
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              启动器仍处于内部测试阶段，发布前不会提供下载文件。本页不会放置占位安装包、假下载按钮或外部网盘链接；请勿从第三方渠道下载任何声称是「RCT
              MP 启动器」的程序。
            </p>
          </div>

          <dl className="grid divide-y divide-gray-700/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-4">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                启动器状态
              </dt>
              <dd className="mt-1 text-sm font-bold text-amber-300">内部测试中</dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                官方下载
              </dt>
              <dd className="mt-1 text-sm font-bold text-gray-400">尚未提供</dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                游戏服务器
              </dt>
              <dd className="mt-1 text-sm font-bold text-blue-300">
                <Link
                  href="/servers"
                  className="underline decoration-blue-500/30 underline-offset-2 transition hover:text-blue-200"
                >
                  即将开放 · 查看状态 →
                </Link>
              </dd>
            </div>
          </dl>

          <div className="border-t border-gray-700 bg-[#232428] px-5 py-3 text-xs leading-5 text-gray-500 md:px-7">
            当前可通过<TextLink href="/servers">服务器列表</TextLink>查看服务器状态；服务器与客户端将在测试完成后开放，具体时间以站内公告为准。
          </div>
        </section>

        <section aria-labelledby="launcher-features" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-700 pb-3">
            <div>
              <h2 id="launcher-features" className="text-xl font-black text-white">
                启动器功能
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                启动器将作为进入 RCT MP 联运的统一入口，计划支持以下能力；功能仍在测试与规划中，最终形态可能调整。
              </p>
            </div>
            <span className="text-xs text-gray-600">不承诺具体发布日期</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-xl border border-gray-700 bg-[#2c2d31] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-[#232428] text-gray-400">
                    {feature.icon}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${FEATURE_STATUS_STYLES[feature.status]}`}
                  >
                    {feature.status}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-white">{feature.title}</h3>
                <p className="mt-1 text-xs leading-5 text-gray-500">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="system-requirements" className="mt-10">
          <div className="border-b border-gray-700 pb-3">
            <h2 id="system-requirements" className="text-xl font-black text-white">
              系统要求
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              以下为目前可以确定的前提条件；完整配置要求将在发布前公布。
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-700 bg-[#2c2d31]">
            <dl className="divide-y divide-gray-700/60">
              {CONFIRMED_REQUIREMENTS.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <dt className="text-xs font-bold text-gray-500">{item.label}</dt>
                  <dd className="text-sm font-bold text-gray-200">{item.value}</dd>
                </div>
              ))}
              {PENDING_REQUIREMENTS.map((label) => (
                <div
                  key={label}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <dt className="text-xs font-bold text-gray-500">{label}</dt>
                  <dd>
                    <span className="inline-flex rounded border border-gray-700 bg-[#232428] px-2 py-0.5 text-[10px] font-bold text-gray-500">
                      待公布
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="mt-2 text-xs text-gray-600">
            「待公布」表示相关要求尚未确定，不代表没有要求；请勿轻信非官方渠道给出的配置表。
          </p>
        </section>

        <section aria-labelledby="download-updates" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-700 pb-3">
            <div>
              <h2 id="download-updates" className="text-xl font-black text-white">
                关注开放进度
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                启动器进入测试、开放下载或服务器开放时，我们会优先在以下页面发布。
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Link
              href="/changelog"
              className="group flex h-full flex-col rounded-xl border border-gray-700 bg-[#2c2d31] p-5 transition hover:border-sky-500/50 hover:bg-[#323338] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-sky-400">
                Changelog
              </p>
              <h3 className="mt-1 text-lg font-black text-white">关注更新日志</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-gray-500">
                查看网站与启动器的功能变更、修复和安全更新记录。
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-300 transition group-hover:text-white">
                前往更新日志
                <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>

            <Link
              href="/news"
              className="group flex h-full flex-col rounded-xl border border-gray-700 bg-[#2c2d31] p-5 transition hover:border-orange-500/50 hover:bg-[#323338] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-400">
                News
              </p>
              <h3 className="mt-1 text-lg font-black text-white">关注新闻公告</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-gray-500">
                启动器测试、下载开放与服务器开放等通知会在这里发布。
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-300 transition group-hover:text-white">
                前往新闻公告
                <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          </div>
        </section>

        <p className="mt-8 rounded-xl border border-gray-800 bg-[#232428] px-4 py-3 text-xs leading-6 text-gray-500">
          官方下载地址只会出现在本页（<span className="font-mono text-gray-400">/download</span>）。正式发布前，任何第三方网站、网盘或群文件提供的「RCT
          MP 启动器」都不是官方版本，请勿运行。
        </p>

        <p className="mt-3 text-center text-xs text-gray-600">
          遇到账号或下载相关问题？前往<TextLink href="/support">帮助与支持</TextLink>查看常见问题。
        </p>
      </div>
    </main>
  );
}
