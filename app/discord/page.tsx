import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getLocale } from '../../lib/i18n-server';
import { tr } from '../../lib/i18n';
import { fetchDiscordInvite, DISCORD_INVITE_URL } from '../../lib/discord';

const EN: Record<string, string> = {
  'Discord 社区': 'Discord Community',
  '加入我们的 Discord，与卡友实时交流、组队联运、第一时间获取公告与活动信息。':
    'Join our Discord to chat with drivers in real time, convoy together, and get announcements and events first.',
  '加入 Discord': 'Join Discord',
  '打开邀请链接': 'Open invite link',
  '社区成员': 'Members',
  '当前在线': 'Online now',
  '欢迎频道': 'Welcome channel',
  '正在读取 Discord 信息…': 'Loading Discord info…',
  '暂时无法读取 Discord 实时数据，但仍可通过邀请链接加入。':
    'Live Discord data is temporarily unavailable, but you can still join via the invite link.',
  '如何加入': 'How to join',
  '社区规则': 'Community rules',
  '联运与活动': 'Convoys & events',
  '点击「加入 Discord」，已有 Discord 账号可直接加入；没有账号会先引导注册（免费）。':
    'Click "Join Discord". If you already have a Discord account you can join directly; otherwise Discord will guide you through a free sign-up.',
  '加入后请先阅读 #规则 / #公告 频道，遵守社区规范；违规同样会被处理。':
    'After joining, read the #rules and #announcements channels first, and follow the community guidelines. Violations are handled the same way as on the site.',
  '联运集合、活动通知与临时车队信息会发布在 Discord；网站活动页仍会同步。':
    'Convoy meetups, event notices and temporary VTC info are posted on Discord. The website events page stays in sync.',
  '为什么加入？': 'Why join?',
  '实时交流：和卡友聊天、问问题、找车队': 'Real-time chat: talk with drivers, ask questions, find a convoy',
  '联运组队：集合、语音协调、临时车队': 'Convoy planning: meetups, voice coordination, temporary VTCs',
  '公告优先：活动与更新第一时间推送': 'Announcements first: events and updates pushed instantly',
  '社区活动：截图分享、抽奖与语音活动': 'Community events: screenshot sharing, giveaways and voice events',
  '常见问题': 'FAQ',
  '加入 Discord 需要付费吗？': 'Does joining Discord cost anything?',
  '不需要，Discord 账号与加入服务器都免费。': 'No. Both a Discord account and joining the server are free.',
  '需要绑定 Steam 吗？': 'Do I need to link Steam?',
  'Discord 频道本身不强制；但站内发帖、报名活动仍要求完成 Steam 正版验证。':
    'Not for Discord itself, but posting and signing up for events on the site still requires Steam verification.',
  'Discord 里遇到问题找谁？': 'Who do I ask if I have a problem on Discord?',
  '可以在 Discord 对应频道留言，或到网站的「帮助与支持」发帖。':
    'Ask in the relevant Discord channel, or post in Help & Support on the website.',
  'Discord 服务器': 'Discord server',
  '返回首页': 'Back to home',
  '查看社区规则': 'View community rules',
  '前往帮助中心': 'Go to Help & Support',
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isEn = locale === 'en';
  return {
    title: isEn ? 'Discord Community' : 'Discord 社区',
    description: isEn
      ? 'Join the RCT MP Discord community for real-time chat, convoys, events and announcements.'
      : '加入 RCT MP 的 Discord 社区：实时交流、组队联运、活动与公告第一时间获取。',
    alternates: { canonical: '/discord' },
  };
}

export default async function DiscordPage() {
  const locale = await getLocale();
  const invite = await fetchDiscordInvite();
  const t = (zh: string) => tr(locale, EN, zh);

  const stats = [
    { label: t('社区成员'), value: invite?.memberCount ?? null },
    { label: t('当前在线'), value: invite?.onlineCount ?? null },
  ];

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 md:px-6 md:py-14">
        {/* Hero */}
        <section className="overflow-hidden rounded-2xl border border-gray-700 bg-[#2c2d31] shadow-2xl">
          <div className="h-24 bg-gradient-to-r from-[#5865F2] via-[#4752C4] to-[#2c2d31]" />
          <div className="px-6 pb-8 md:px-10">
            <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
              {invite?.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={invite.iconUrl}
                  alt={invite.name}
                  className="h-20 w-20 rounded-2xl border-4 border-[#2c2d31] bg-[#232428] object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[#2c2d31] bg-[#5865F2] text-3xl font-black text-white shadow-lg">
                  R
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Discord</p>
                <h1 className="truncate text-2xl font-black text-white md:text-3xl">
                  {invite?.name ?? t('Discord 社区')}
                </h1>
              </div>
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#5865F2] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#4752C4]"
              >
                {t('加入 Discord')} →
              </a>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-300 md:text-base">
              {t(
                '加入我们的 Discord，与卡友实时交流、组队联运、第一时间获取公告与活动信息。'
              )}
            </p>
            {invite?.description && (
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
                {invite.description}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-gray-700 bg-[#18191c] px-4 py-2"
                >
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">{stat.label}</p>
                  <p className="text-lg font-black text-white">
                    {stat.value === null ? '—' : stat.value}
                  </p>
                </div>
              ))}
              {invite?.channelName && (
                <div className="rounded-lg border border-gray-700 bg-[#18191c] px-4 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">
                    {t('欢迎频道')}
                  </p>
                  <p className="text-lg font-black text-white">#{invite.channelName}</p>
                </div>
              )}
            </div>

            {!invite && (
              <p className="mt-4 rounded border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-300">
                {t('暂时无法读取 Discord 实时数据，但仍可通过邀请链接加入。')}
              </p>
            )}
          </div>
        </section>

        {/* 三个入口 */}
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              title: t('如何加入'),
              body: t(
                '点击「加入 Discord」，已有 Discord 账号可直接加入；没有账号会先引导注册（免费）。'
              ),
              href: null,
            },
            {
              title: t('社区规则'),
              body: t('加入后请先阅读 #规则 / #公告 频道，遵守社区规范；违规同样会被处理。'),
              href: '/rules',
            },
            {
              title: t('联运与活动'),
              body: t('联运集合、活动通知与临时车队信息会发布在 Discord；网站活动页仍会同步。'),
              href: '/events',
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-gray-700 bg-[#2c2d31] p-5 shadow-lg"
            >
              <h2 className="text-base font-bold text-white">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{card.body}</p>
              {card.href && (
                <Link
                  href={card.href}
                  className="mt-3 inline-block text-xs font-bold text-blue-400 hover:text-blue-300"
                >
                  {card.href === '/rules' ? t('查看社区规则') : t('联运与活动')} →
                </Link>
              )}
            </div>
          ))}
        </section>

        {/* 为什么加入 */}
        <section className="mt-6 rounded-xl border border-gray-700 bg-[#2c2d31] p-6 shadow-lg">
          <h2 className="text-lg font-bold text-white">{t('为什么加入？')}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-300 md:grid-cols-2">
            {[
              t('实时交流：和卡友聊天、问问题、找车队'),
              t('联运组队：集合、语音协调、临时车队'),
              t('公告优先：活动与更新第一时间推送'),
              t('社区活动：截图分享、抽奖与语音活动'),
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-0.5 text-green-400">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mt-6 rounded-xl border border-gray-700 bg-[#2c2d31] p-6 shadow-lg">
          <h2 className="text-lg font-bold text-white">{t('常见问题')}</h2>
          <div className="mt-4 space-y-3">
            {[
              {
                q: t('加入 Discord 需要付费吗？'),
                a: t('不需要，Discord 账号与加入服务器都免费。'),
              },
              {
                q: t('需要绑定 Steam 吗？'),
                a: t(
                  'Discord 频道本身不强制；但站内发帖、报名活动仍要求完成 Steam 正版验证。'
                ),
              },
              {
                q: t('Discord 里遇到问题找谁？'),
                a: t('可以在 Discord 对应频道留言，或到网站的「帮助与支持」发帖。'),
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border border-gray-700 bg-[#18191c] px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-sm font-bold text-gray-200 transition group-open:text-white">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 底部 CTA */}
        <section className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 p-6 md:flex-row">
          <div>
            <h2 className="text-lg font-bold text-white">{t('Discord 社区')}</h2>
            <p className="mt-1 text-sm text-gray-400">
              {t('加入我们的 Discord，与卡友实时交流、组队联运、第一时间获取公告与活动信息。')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-[#5865F2] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#4752C4]"
            >
              {t('加入 Discord')} →
            </a>
            <Link
              href="/support"
              className="rounded-lg border border-gray-600 px-6 py-3 text-sm font-bold text-gray-300 transition hover:border-gray-400 hover:text-white"
            >
              {t('前往帮助中心')}
            </Link>
          </div>
        </section>

        <div className="mt-8 text-center">
          <Link href="/" className="text-xs text-gray-500 hover:text-blue-400">
            ← {t('返回首页')}
          </Link>
        </div>
      </div>
    </main>
  );
}
