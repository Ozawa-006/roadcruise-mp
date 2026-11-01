// app/support/page.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getLocale } from '../../lib/i18n-server';
import { tr } from '../../lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: tr(locale, EN, '帮助与支持'),
    description: tr(
      locale,
      EN,
      'RCT MP 帮助与支持中心：账号注册、Steam 正版验证、论坛发帖、VTC 车队、活动报名、违规举报与账号找回的常见问题解答。'
    ),
    alternates: { canonical: '/support' },
  };
}

/**
 * 静态 UI 文案：中文原文 -> 英文。英文缺失时回退中文。
 * 按区块分组：页面头部 / 快捷入口 / FAQ / 仍未解决。
 * 说明：站内链接路径、邮箱地址与日期不翻译。
 */
const EN: Record<string, string> = {
  // ---------- metadata ----------
  'RCT MP 帮助与支持中心：账号注册、Steam 正版验证、论坛发帖、VTC 车队、活动报名、违规举报与账号找回的常见问题解答。':
    'RCT MP Help & Support: answers to common questions about account registration, Steam verification, forum posting, VTCs, event sign-ups, reporting violations and account recovery.',

  // ---------- 页面头部 ----------
  '帮助与支持': 'Help & Support',
  '从注册、Steam 验证到发帖、加入车队和报名活动，这里汇总了 RCT MP 最常见的操作问题。找不到答案时，可以到论坛帮助版块求助。':
    'From registration and Steam verification to posting, joining a VTC and signing up for events, this page collects the most common how-to questions about RCT MP. If you cannot find an answer here, ask in the forum help section.',
  '8 个常见问题': '8 common questions',
  '点击问题展开答案': 'Click a question to expand the answer',
  '前往帮助版块 →': 'Go to the help section →',

  // ---------- 快捷入口 ----------
  '快捷入口': 'Quick links',
  '常用页面直达，先看看这里有没有你要找的功能。':
    'Direct links to frequently used pages — check here first.',
  '论坛帮助版块': 'Forum help section',
  '遇到账号、发帖或活动问题时，在这里发帖求助。':
    'Post here when you run into account, posting or event problems.',
  '社区规则': 'Community rules',
  '发帖、联运与车队行为的准则，也是举报处理的依据。':
    'The rules for posting, convoys and VTC behaviour, and the basis for handling reports.',
  '举报与申诉': 'Reports & appeals',
  '提交违规证据，或对处理结果提出申诉。':
    'Submit evidence of a violation, or appeal a decision.',
  '更新日志': 'Changelog',
  '查看网站功能变更、修复与安全更新记录。':
    'See feature changes, fixes and security updates for the site.',
  '游戏服务器': 'Game servers',
  '查看服务器开放状态；当前尚未配置，显示「即将开放」。':
    'Check server availability; none are configured yet, so they show as “coming soon”.',

  // ---------- FAQ 区块标题 ----------
  '常见问题': 'Frequently asked questions',
  '按账号、论坛、车队与活动等场景整理。':
    'Organized by account, forum, VTC and event scenarios.',
  '内容以站内当前功能为准': 'Content reflects the features currently available on this site',

  // ---------- FAQ 1：注册 ----------
  '如何注册 RCT MP 账号？': 'How do I create an RCT MP account?',
  '注册入口在': 'Registration starts at ',
  '登录 / 注册页': 'Sign in / Register',
  '。为了确认正版资格，注册前必须先完成 Steam 验证：使用拥有《欧洲卡车模拟2》、且游戏时长超过 2 小时的 Steam 账号验证；验证通过后，再填写昵称、邮箱和密码。':
    '. To confirm you own the game, you must complete Steam verification first: verify with a Steam account that owns Euro Truck Simulator 2 and has more than 2 hours of playtime. Once verified, fill in your nickname, email and password.',
  '密码至少 6 个字符。请填写常用邮箱，后续登录会用到。':
    'The password must be at least 6 characters. Use an email address you check regularly — you will need it to sign in.',

  // ---------- FAQ 2：Steam 验证 ----------
  '为什么注册和发帖前必须完成 Steam 验证？':
    'Why is Steam verification required before registering and posting?',
  'RCT MP 只对拥有正版《欧洲卡车模拟2》的玩家开放。验证会读取 Steam 公开游戏库中的游戏所有权与游玩时长，不会获取你的 Steam 密码。通过后账号才会标记为「已验证」，才能发帖和报名活动。':
    'RCT MP is only open to players who own Euro Truck Simulator 2. Verification reads game ownership and playtime from your public Steam library; it never accesses your Steam password. Only after passing is the account marked as verified, which is required to post and sign up for events.',
  '如果提示无法读取游戏库，请到 Steam 隐私设置中把「个人资料」和「游戏详情」设为公开，然后重新验证。已经注册但未绑定的账号，可到':
    'If you are told the game library cannot be read, set Profile and Game details to public in your Steam privacy settings, then verify again. If you are already registered but not bound, go to ',
  '账号设置': 'Account settings',
  '完成绑定。': ' to finish binding.',

  // ---------- FAQ 3：无法发帖 ----------
  '为什么我不能发帖？': 'Why can I not post?',
  '常见原因有三种：': 'There are three common reasons:',
  '尚未登录，先到': 'You are not signed in — sign in on the ',
  '登录页': 'sign-in page',
  '登录；': ' first;',
  '已登录但未完成 Steam 验证，发帖页会提示先到':
    'You are signed in but not Steam-verified; the posting page asks you to go to ',
  '绑定；': ' and bind Steam;',
  '在官方公告版块发帖需要 Lv.70 及以上权限，普通版块不受此限制。':
    'Posting in the official announcements section requires Lv.70 or above; regular sections have no such restriction.',
  '确认以上条件后，从': 'Once the above is satisfied, open the relevant section from the ',
  '论坛首页': 'forum home',
  '进入对应版块，点击「发布新帖」即可。': ' and click “New post”.',

  // ---------- FAQ 4：加入 VTC ----------
  '如何申请加入 VTC（车队）？': 'How do I apply to join a VTC?',
  '先到': 'Start at the ',
  '车队大厅': 'VTC lobby',
  '浏览。开放加入的车队可以直接点「立即加入」；需要审核的车队请点「申请加入」，填写在线时间、驾驶经验等留言，等待队长或副队长审核。':
    '. VTCs that accept open applications have a “Join now” button; VTCs that require review have an “Apply” button — leave a message about your online hours and driving experience, then wait for the leader or deputy leader to review it.',
  '同一时间只能加入一个车队；已有待审核申请时，需要先取消才能申请其它车队。没有找到合适车队时，也可以在':
    'You can only join one VTC at a time; if you already have a pending application, cancel it before applying elsewhere. If you cannot find a suitable VTC, you can also create your own on the ',
  '创建车队': 'create VTC',
  '页面建立自己的车队并设置加入方式。': ' page and choose how members join.',

  // ---------- FAQ 5：活动报名 ----------
  '如何报名参加活动？': 'How do I sign up for an event?',
  '在': 'Find the event in the ',
  '活动列表': 'event list',
  '或': ' or the ',
  '活动日历': 'event calendar',
  '中找到活动，进入详情页后点「立即报名」。报名需要登录并已完成 Steam 验证；名额有限的活动先到先得。':
    ', open its detail page and click “Sign up now”. Signing up requires being signed in and Steam-verified; events with limited spots are first come, first served.',
  '活动开始前可以在详情页取消报名。报名成功后请按活动说明准时上线；如需迟到或带人参加，可在报名留言中说明。':
    'You can cancel your sign-up on the detail page before the event starts. After signing up, be online on time as described in the event notes; if you will be late or bring someone, mention it in the sign-up message.',

  // ---------- FAQ 6：举报与申诉 ----------
  '如何举报违规或对处罚提出申诉？': 'How do I report a rule violation or appeal a punishment?',
  '请通过': 'Submit it via ',
  '提交，不要在与对方的争执帖中公开他人隐私。提交时请写清发生时间（注明时区）、所在服务器、对方昵称或 Steam 主页、事情经过，并附上截图或视频链接。':
    '. Do not post other people’s private information in a dispute thread. Include the time it happened (with time zone), the server, the other player’s nickname or Steam profile, what happened, and links to screenshots or videos.',
  '工作人员会依据': 'Staff will review it against the ',
  '核实处理。对处罚结果有异议时，也请在同一入口提交申诉，并附上原始证据。':
    '. If you disagree with the result, submit an appeal through the same entry with the original evidence.',

  // ---------- FAQ 7：账号找回 ----------
  '如何找回账号或修改密码？': 'How do I recover my account or change my password?',
  '仍能登录时，请到': 'If you can still sign in, go to ',
  '的「账号安全」修改密码：需要先输入当前密码，新密码至少 8 个字符。':
    ' → Account security to change your password: enter your current password first, and the new password must be at least 8 characters.',
  '完全无法登录时，请在': 'If you cannot sign in at all, go to the ',
  '点「忘记密码？」，输入注册邮箱，系统会发送一封重置密码邮件（发件人 ':
    ' and click “Forgot password?”, then enter your registered email; a password reset email will be sent (sender ',
  '）。点击邮件里的链接即可设置新密码；如果没收到，请检查垃圾邮件，或稍等几分钟再试。':
    '). Click the link in the email to set a new password. If you do not receive it, check your spam folder or wait a few minutes and try again.',
  '若邮箱也已无法使用，请到': 'If you no longer have access to that email, post in the ',
  '发帖，说明注册邮箱、绑定的 Steam 主页和最后一次正常登录时间，由工作人员核实后协助处理。':
    ' with the registered email, the bound Steam profile and the last time you signed in successfully; staff will verify and help.',
  '请勿在帖子中公开密码、邮箱验证码或 Steam 令牌。':
    'Never post your password, email verification code or Steam Guard code publicly.',

  // ---------- FAQ 8：服务器与客户端 ----------
  '游戏服务器和客户端什么时候开放？': 'When will the game servers and client be available?',
  'RCT MP 游戏服务器仍在配置与测试中，':
    'RCT MP game servers are still being configured and tested. The ',
  '服务器列表': 'server list',
  '当前显示「即将开放」，暂时不提供连接地址。启动器也仍在内部测试，正式发布后才会在':
    ' currently shows “coming soon” and no connection address is available yet. The launcher is also in internal testing; the official installer will be offered on the ',
  '客户端下载': 'client download',
  '页面提供官方安装包。': ' page once it is released.',
  '开放时间以': 'Release timing is announced in the ',
  '和': ' and the ',
  '新闻公告': 'news & announcements',
  '为准。请勿从第三方渠道下载声称是「RCT MP 启动器」的文件。':
    '. Never download files claiming to be the “RCT MP Launcher” from third-party sources.',

  // ---------- 仍未解决 ----------
  '还是没解决？': 'Still not solved?',
  '请到论坛的': 'Post in the forum’s ',
  '帮助与支持版块': 'help & support section',
  '发帖，把问题描述清楚，工作人员会按顺序查看。发帖前建议先搜索版块内是否已有同类问题。':
    ' with a clear description of the problem; staff review posts in order. Before posting, search the section for an existing answer.',
  '问题截图或完整报错': 'Screenshots or the full error message',
  '发生时间（注明时区，如 UTC+8）': 'When it happened (include the time zone, e.g. UTC+8)',
  '相关服务器名称或页面地址': 'The server name or page URL involved',
  '已经尝试过的操作': 'What you have already tried',
  '举报与申诉请走': 'Use the ',
  '入口，不要在公开帖中发布他人隐私或未经处理的证据。论坛发帖需要登录并完成 Steam 验证。':
    ' entry for reports and appeals; do not post other people’s private information or unredacted evidence publicly. Posting on the forum requires signing in and completing Steam verification.',
  '查看社区规则': 'View community rules',
  '工作人员会按顺序处理，请勿重复发帖。':
    'Staff handle posts in order — please do not post duplicates.',
};

type Accent = 'blue' | 'emerald' | 'orange' | 'sky' | 'violet';

const ACCENT_STYLES: Record<Accent, { icon: string; hover: string }> = {
  blue: {
    icon: 'border-blue-500/25 bg-blue-500/10 text-blue-400',
    hover: 'hover:border-blue-500/50',
  },
  emerald: {
    icon: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
    hover: 'hover:border-emerald-500/50',
  },
  orange: {
    icon: 'border-orange-500/25 bg-orange-500/10 text-orange-400',
    hover: 'hover:border-orange-500/50',
  },
  sky: {
    icon: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
    hover: 'hover:border-sky-500/50',
  },
  violet: {
    icon: 'border-violet-500/25 bg-violet-500/10 text-violet-400',
    hover: 'hover:border-violet-500/50',
  },
};

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

function QuickLink({
  href,
  title,
  description,
  accent,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  accent: Accent;
  icon: ReactNode;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <Link
      href={href}
      className={`group flex h-full flex-col gap-3 rounded-xl border border-gray-700 bg-[#2c2d31] p-4 transition hover:bg-[#323338] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${styles.hover}`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg border ${styles.icon}`}
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          {title}
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
        <span className="mt-1 block text-xs leading-5 text-gray-500">{description}</span>
      </span>
    </Link>
  );
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-gray-700 bg-[#2c2d31] transition open:border-blue-500/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gray-700 bg-[#232428] text-[10px] font-bold text-gray-500 transition group-open:border-blue-500/40 group-open:text-blue-400"
        >
          Q
        </span>
        <span className="flex-1 text-sm font-bold text-gray-200 transition group-open:text-white">
          {question}
        </span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="border-t border-gray-700/60 px-4 py-4 text-sm leading-7 text-gray-400 sm:px-5">
        {children}
      </div>
    </details>
  );
}

export default async function SupportPage() {
  const locale = await getLocale();

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <header className="border-b border-gray-700 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-400">
            RCT MP · Support Center
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">
              {tr(locale, EN, '帮助与支持')}
            </h1>
            <span className="text-lg font-bold text-gray-500 md:text-xl">/ Support</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            {tr(
              locale,
              EN,
              '从注册、Steam 验证到发帖、加入车队和报名活动，这里汇总了 RCT MP 最常见的操作问题。找不到答案时，可以到论坛帮助版块求助。'
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-gray-700 bg-[#2c2d31] px-3 py-1 text-gray-500">
              {tr(locale, EN, '8 个常见问题')}
            </span>
            <span className="rounded-full border border-gray-700 bg-[#2c2d31] px-3 py-1 text-gray-500">
              {tr(locale, EN, '点击问题展开答案')}
            </span>
            <Link
              href="/forum/3"
              className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 font-bold text-blue-300 transition hover:border-blue-400 hover:text-white"
            >
              {tr(locale, EN, '前往帮助版块 →')}
            </Link>
          </div>
        </header>

        <section aria-labelledby="quick-links" className="mt-8">
          <h2 id="quick-links" className="text-xl font-black text-white">
            {tr(locale, EN, '快捷入口')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {tr(locale, EN, '常用页面直达，先看看这里有没有你要找的功能。')}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <QuickLink
              href="/forum/3"
              title={tr(locale, EN, '论坛帮助版块')}
              description={tr(locale, EN, '遇到账号、发帖或活动问题时，在这里发帖求助。')}
              accent="blue"
              icon={
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M8 10h8M8 14h5m-9 6l3.5-3.5H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h1v4z"
                  />
                </svg>
              }
            />
            <QuickLink
              href="/rules"
              title={tr(locale, EN, '社区规则')}
              description={tr(locale, EN, '发帖、联运与车队行为的准则，也是举报处理的依据。')}
              accent="emerald"
              icon={
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              }
            />
            <QuickLink
              href="/reports"
              title={tr(locale, EN, '举报与申诉')}
              description={tr(locale, EN, '提交违规证据，或对处理结果提出申诉。')}
              accent="orange"
              icon={
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              }
            />
            <QuickLink
              href="/changelog"
              title={tr(locale, EN, '更新日志')}
              description={tr(locale, EN, '查看网站功能变更、修复与安全更新记录。')}
              accent="sky"
              icon={
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
            <QuickLink
              href="/servers"
              title={tr(locale, EN, '游戏服务器')}
              description={tr(locale, EN, '查看服务器开放状态；当前尚未配置，显示「即将开放」。')}
              accent="violet"
              icon={
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                  />
                </svg>
              }
            />
          </div>
        </section>

        <section aria-labelledby="faq" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-700 pb-3">
            <div>
              <h2 id="faq" className="text-xl font-black text-white">
                {tr(locale, EN, '常见问题')}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {tr(locale, EN, '按账号、论坛、车队与活动等场景整理。')}
              </p>
            </div>
            <span className="text-xs text-gray-600">{tr(locale, EN, '内容以站内当前功能为准')}</span>
          </div>

          <div className="mt-4 space-y-2.5">
            <FaqItem question={tr(locale, EN, '如何注册 RCT MP 账号？')}>
              <p>
                {tr(locale, EN, '注册入口在')}
                <TextLink href="/login">{tr(locale, EN, '登录 / 注册页')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '。为了确认正版资格，注册前必须先完成 Steam 验证：使用拥有《欧洲卡车模拟2》、且游戏时长超过 2 小时的 Steam 账号验证；验证通过后，再填写昵称、邮箱和密码。'
                )}
              </p>
              <p className="mt-2 text-gray-500">
                {tr(locale, EN, '密码至少 6 个字符。请填写常用邮箱，后续登录会用到。')}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '为什么注册和发帖前必须完成 Steam 验证？')}>
              <p>
                {tr(
                  locale,
                  EN,
                  'RCT MP 只对拥有正版《欧洲卡车模拟2》的玩家开放。验证会读取 Steam 公开游戏库中的游戏所有权与游玩时长，不会获取你的 Steam 密码。通过后账号才会标记为「已验证」，才能发帖和报名活动。'
                )}
              </p>
              <p className="mt-2">
                {tr(
                  locale,
                  EN,
                  '如果提示无法读取游戏库，请到 Steam 隐私设置中把「个人资料」和「游戏详情」设为公开，然后重新验证。已经注册但未绑定的账号，可到'
                )}
                <TextLink href="/settings">{tr(locale, EN, '账号设置')}</TextLink>
                {tr(locale, EN, '完成绑定。')}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '为什么我不能发帖？')}>
              <p>{tr(locale, EN, '常见原因有三种：')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  {tr(locale, EN, '尚未登录，先到')}
                  <TextLink href="/login">{tr(locale, EN, '登录页')}</TextLink>
                  {tr(locale, EN, '登录；')}
                </li>
                <li>
                  {tr(locale, EN, '已登录但未完成 Steam 验证，发帖页会提示先到')}
                  <TextLink href="/settings">{tr(locale, EN, '账号设置')}</TextLink>
                  {tr(locale, EN, '绑定；')}
                </li>
                <li>
                  {tr(locale, EN, '在官方公告版块发帖需要 Lv.70 及以上权限，普通版块不受此限制。')}
                </li>
              </ul>
              <p className="mt-2">
                {tr(locale, EN, '确认以上条件后，从')}
                <TextLink href="/forum">{tr(locale, EN, '论坛首页')}</TextLink>
                {tr(locale, EN, '进入对应版块，点击「发布新帖」即可。')}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '如何申请加入 VTC（车队）？')}>
              <p>
                {tr(locale, EN, '先到')}
                <TextLink href="/vtc">{tr(locale, EN, '车队大厅')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '浏览。开放加入的车队可以直接点「立即加入」；需要审核的车队请点「申请加入」，填写在线时间、驾驶经验等留言，等待队长或副队长审核。'
                )}
              </p>
              <p className="mt-2">
                {tr(
                  locale,
                  EN,
                  '同一时间只能加入一个车队；已有待审核申请时，需要先取消才能申请其它车队。没有找到合适车队时，也可以在'
                )}
                <TextLink href="/vtc/create">{tr(locale, EN, '创建车队')}</TextLink>
                {tr(locale, EN, '页面建立自己的车队并设置加入方式。')}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '如何报名参加活动？')}>
              <p>
                {tr(locale, EN, '在')}
                <TextLink href="/events">{tr(locale, EN, '活动列表')}</TextLink>
                {tr(locale, EN, '或')}
                <TextLink href="/events/calendar">{tr(locale, EN, '活动日历')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '中找到活动，进入详情页后点「立即报名」。报名需要登录并已完成 Steam 验证；名额有限的活动先到先得。'
                )}
              </p>
              <p className="mt-2">
                {tr(
                  locale,
                  EN,
                  '活动开始前可以在详情页取消报名。报名成功后请按活动说明准时上线；如需迟到或带人参加，可在报名留言中说明。'
                )}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '如何举报违规或对处罚提出申诉？')}>
              <p>
                {tr(locale, EN, '请通过')}
                <TextLink href="/reports">{tr(locale, EN, '举报与申诉')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '提交，不要在与对方的争执帖中公开他人隐私。提交时请写清发生时间（注明时区）、所在服务器、对方昵称或 Steam 主页、事情经过，并附上截图或视频链接。'
                )}
              </p>
              <p className="mt-2">
                {tr(locale, EN, '工作人员会依据')}
                <TextLink href="/rules">{tr(locale, EN, '社区规则')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '核实处理。对处罚结果有异议时，也请在同一入口提交申诉，并附上原始证据。'
                )}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '如何找回账号或修改密码？')}>
              <p>
                {tr(locale, EN, '仍能登录时，请到')}
                <TextLink href="/settings">{tr(locale, EN, '账号设置')}</TextLink>
                {tr(locale, EN, '的「账号安全」修改密码：需要先输入当前密码，新密码至少 8 个字符。')}
              </p>
              <p className="mt-2">
                {tr(locale, EN, '完全无法登录时，请在')}
                <TextLink href="/login">{tr(locale, EN, '登录页')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '点「忘记密码？」，输入注册邮箱，系统会发送一封重置密码邮件（发件人 '
                )}
                <span className="text-gray-300">RCT MP &lt;noreply@mail.roadcruise-mp.com&gt;</span>
                {tr(
                  locale,
                  EN,
                  '）。点击邮件里的链接即可设置新密码；如果没收到，请检查垃圾邮件，或稍等几分钟再试。'
                )}
              </p>
              <p className="mt-2">
                {tr(locale, EN, '若邮箱也已无法使用，请到')}
                <TextLink href="/forum/3">{tr(locale, EN, '论坛帮助版块')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '发帖，说明注册邮箱、绑定的 Steam 主页和最后一次正常登录时间，由工作人员核实后协助处理。'
                )}
              </p>
              <p className="mt-2 text-gray-500">
                {tr(locale, EN, '请勿在帖子中公开密码、邮箱验证码或 Steam 令牌。')}
              </p>
            </FaqItem>

            <FaqItem question={tr(locale, EN, '游戏服务器和客户端什么时候开放？')}>
              <p>
                {tr(locale, EN, 'RCT MP 游戏服务器仍在配置与测试中，')}
                <TextLink href="/servers">{tr(locale, EN, '服务器列表')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '当前显示「即将开放」，暂时不提供连接地址。启动器也仍在内部测试，正式发布后才会在'
                )}
                <TextLink href="/download">{tr(locale, EN, '客户端下载')}</TextLink>
                {tr(locale, EN, '页面提供官方安装包。')}
              </p>
              <p className="mt-2">
                {tr(locale, EN, '开放时间以')}
                <TextLink href="/changelog">{tr(locale, EN, '更新日志')}</TextLink>
                {tr(locale, EN, '和')}
                <TextLink href="/news">{tr(locale, EN, '新闻公告')}</TextLink>
                {tr(locale, EN, '为准。请勿从第三方渠道下载声称是「RCT MP 启动器」的文件。')}
              </p>
            </FaqItem>
          </div>
        </section>

        <section
          aria-labelledby="still-need-help"
          className="mt-10 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#2c2d31] via-[#2c2d31] to-[#232428] p-5 md:p-7"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-400">
                Still Need Help?
              </p>
              <h2 id="still-need-help" className="mt-1 text-2xl font-black text-white">
                {tr(locale, EN, '还是没解决？')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                {tr(locale, EN, '请到论坛的')}
                <TextLink href="/forum/3">{tr(locale, EN, '帮助与支持版块')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '发帖，把问题描述清楚，工作人员会按顺序查看。发帖前建议先搜索版块内是否已有同类问题。'
                )}
              </p>

              <ul className="mt-4 grid gap-2 text-sm text-gray-400 sm:grid-cols-2">
                <li className="flex items-start gap-2">
                  <svg
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{tr(locale, EN, '问题截图或完整报错')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{tr(locale, EN, '发生时间（注明时区，如 UTC+8）')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{tr(locale, EN, '相关服务器名称或页面地址')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{tr(locale, EN, '已经尝试过的操作')}</span>
                </li>
              </ul>

              <p className="mt-4 text-xs leading-5 text-gray-500">
                {tr(locale, EN, '举报与申诉请走')}
                <TextLink href="/reports">{tr(locale, EN, '举报与申诉')}</TextLink>
                {tr(
                  locale,
                  EN,
                  '入口，不要在公开帖中发布他人隐私或未经处理的证据。论坛发帖需要登录并完成 Steam 验证。'
                )}
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2 lg:w-52">
              <Link
                href="/forum/3"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {tr(locale, EN, '前往帮助版块 →')}
              </Link>
              <Link
                href="/rules"
                className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-[#232428] px-4 py-2.5 text-sm font-bold text-gray-300 transition hover:border-gray-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {tr(locale, EN, '查看社区规则')}
              </Link>
              <p className="mt-1 text-center text-[11px] leading-5 text-gray-600">
                {tr(locale, EN, '工作人员会按顺序处理，请勿重复发帖。')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
