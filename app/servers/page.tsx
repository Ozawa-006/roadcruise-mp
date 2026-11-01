'use client';

import { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import type { ServerStatus, ServersStatusPayload } from '../../lib/server-status';
import { formatMessage, tr as translateFor, type Locale } from '@/lib/i18n';
import { useLocale, useTr } from '@/components/I18nProvider';

// ---------------------------------------------------------------------------
// 英文文案：key 为中文原文，value 为英文译文；英文缺失时自动回退中文。
// 服务器名称 / ID / 地址 / 地区 / 版本号 / 协议号来自接口数据，不在翻译范围内。
// ---------------------------------------------------------------------------
const EN: Record<string, string> = {
  // 页面头部
  '服务器列表': 'Game servers',
  '查看 RCTMP 游戏服务器实时状态、在线玩家与连接入口。数据由本站服务端代理抓取，每 5 秒自动刷新，页面隐藏时暂停。':
    'Live status, online players and launcher entry points for RCTMP game servers. Data is proxied by our server, refreshes every 5 seconds, and pauses while the page is hidden.',
  '自动刷新异常，正在重试': 'Auto-refresh failed, retrying',
  '正在获取服务器状态': 'Fetching server status',
  '数据已更新': 'Data updated',
  '最后更新': 'Last updated',
  '立即刷新': 'Refresh now',

  // 服务器状态标签
  '在线': 'Online',
  '离线': 'Offline',
  '未知': 'Unknown',

  // 服务器卡片
  '版本': 'Version',
  '协议': 'Protocol',
  '连接启动器（状态未知）': 'Launch launcher (status unknown)',
  '连接启动器': 'Launch launcher',
  '服务器状态未知，暂时无法连接，请稍后再试':
    'Server status is unknown, so connecting is unavailable. Please try again later.',
  '需要已安装 RCTMP 启动器': 'Requires the RCTMP launcher',
  '在线玩家': 'Online players',
  '容量未知': 'Capacity unknown',
  '{name} 在线人数': '{name} online players',
  '运行时长': 'Uptime',
  '平均邻居': 'Avg. neighbors',
  'Tick 延迟': 'Tick latency',
  '地址': 'Address',
  '{count} 人': '{count} players',
  '{snapshots} 条快照 / 在线 {online} 人': '{snapshots} snapshots / {online} online',
  '收起': 'Collapse',
  '展开全部（{count}）': 'Show all ({count})',
  '暂无可见的在线玩家': 'No visible online players',
  '名称': 'Name',
  '在线时长': 'Session time',
  '速度': 'Speed',
  '服务端返回了 {shown} 条玩家明细，少于在线人数 {online}。':
    'The server returned {shown} player records, fewer than the {online} players online.',

  // 服务器错误提示
  '抓取失败（{code}）': 'Fetch failed ({code})',
  '服务器鉴权未通过，请稍后再试或联系管理员。':
    'Server authentication failed. Please try again later or contact an administrator.',
  '服务器响应超时，请稍后再试。': 'The server timed out. Please try again later.',
  '服务器返回的数据异常，请稍后再试。':
    'The server returned unexpected data. Please try again later.',
  '暂时无法连接游戏服务器，请稍后再试。':
    'Cannot reach the game server right now. Please try again later.',
  '未找到该服务器。': 'Server not found.',
  '错误码：{code}': 'Error code: {code}',
  '该服务器本轮状态刷新失败；其它服务器不受影响，页面会每 5 秒自动重试。':
    'This server failed its status refresh; other servers are unaffected. The page retries every 5 seconds.',
  '连接启动器（离线）': 'Launch launcher (offline)',

  // 加载 / 未开放 / 空 / 错误状态
  '正在获取服务器状态…': 'Fetching server status…',
  '服务器即将开放，敬请期待': 'Servers are opening soon',
  '游戏服务端正在测试中。开放后这里会展示各服务器的实时状态、在线玩家与启动器连接入口。':
    'The game servers are still in testing. Once open, this page will show each server’s live status, online players and launcher entry point.',
  '请稍后再来看看，感谢你的耐心等待。':
    'Please check back later, and thanks for your patience.',
  '暂时无法获取服务器状态': 'Unable to fetch server status',
  '页面会每 5 秒自动重试；也可以点击下方按钮立即重试。':
    'The page retries every 5 seconds; you can also retry right now with the button below.',
  '立即重试': 'Retry now',
  '当前暂无在线服务器': 'No servers online right now',
  '服务器可能正在维护或尚未开放，请稍后再来看看。':
    'Servers may be under maintenance or not open yet. Please check back later.',
  '自动刷新失败': 'Auto-refresh failed',
  '当前显示的是上次成功获取的数据，页面会每 5 秒继续重试。':
    'Showing the last data fetched successfully; the page keeps retrying every 5 seconds.',
  '所有服务器当前均离线。': 'All servers are currently offline.',
  '暂时无法获取实时状态，详情见下方提示。':
    'Live status is unavailable right now. See the details below.',
  '数据由本站服务端定时获取，仅供参考；实际连接以启动器校验结果为准。':
    'Data is fetched periodically by our server and is for reference only; the launcher validation result is authoritative.',

  // 时长单位（实时长文案在浏览器端拼接，用模板占位）
  '{count} 秒': '{count}s',
  '{days} 天 {hours} 小时': '{days}d {hours}h',
  '{hours} 小时 {minutes} 分': '{hours}h {minutes}m',
  '{minutes} 分 {seconds} 秒': '{minutes}m {seconds}s',

  // 请求失败文案（在 effect 内按 locale 构造）
  '服务暂时不可用（HTTP {status}）': 'Service unavailable (HTTP {status})',
  '服务器状态数据异常': 'Unexpected server status data',
  '未知错误': 'Unknown error',
};

/** useTr 返回的翻译函数类型，供模块级工具函数复用。 */
type Translate = (zh: string, vars?: Record<string, string | number>) => string;

/**
 * effect / 事件回调里构造文案：tr 每次渲染都会重新创建，不适合放进依赖数组，
 * 这里直接按当前 locale 翻译。
 */
function translateNow(
  locale: Locale,
  zh: string,
  vars?: Record<string, string | number>
): string {
  return formatMessage(translateFor(locale, EN, zh), vars);
}

const REFRESH_INTERVAL_MS = 5000;
const PLAYER_PREVIEW_LIMIT = 20;

const STATUS_META = {
  online: {
    label: '在线',
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    pulse: true,
  },
  offline: {
    label: '离线',
    dot: 'bg-red-500',
    text: 'text-red-400',
    pulse: false,
  },
  unknown: {
    label: '未知',
    dot: 'bg-gray-500',
    text: 'text-gray-400',
    pulse: false,
  },
} as const;

type ServerState = keyof typeof STATUS_META;

const ERROR_LABELS: Record<string, string> = {
  unauthorized: '服务器鉴权未通过，请稍后再试或联系管理员。',
  timeout: '服务器响应超时，请稍后再试。',
  bad_response: '服务器返回的数据异常，请稍后再试。',
  network_error: '暂时无法连接游戏服务器，请稍后再试。',
  unknown_server: '未找到该服务器。',
};

function isServersStatusPayload(value: unknown): value is ServersStatusPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.servers) &&
    Array.isArray(record.errors) &&
    typeof record.fetchedAt === 'string' &&
    (record.configured === undefined || typeof record.configured === 'boolean')
  );
}

function StatusDot({ state }: { state: ServerState }) {
  const tr = useTr(EN);
  const meta = STATUS_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${meta.text}`}>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot} ${
          meta.pulse ? 'animate-pulse' : ''
        }`}
      />
      {tr(meta.label)}
    </span>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-700/60 bg-[#232428] px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm text-gray-200 ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function formatClock(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return '--:--:--';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

function formatPing(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} ms`;
}

function formatSpeed(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} km/h`;
}

function humanizeDuration(
  value: number | null | undefined,
  tr: Translate
): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  const total = Math.floor(value);
  if (total < 60) return tr('{count} 秒', { count: total });
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return tr('{days} 天 {hours} 小时', { days, hours });
  if (hours > 0) return tr('{hours} 小时 {minutes} 分', { hours, minutes });
  return tr('{minutes} 分 {seconds} 秒', { minutes, seconds });
}

function pingColor(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-gray-500';
  if (value <= 80) return 'text-emerald-400';
  if (value <= 150) return 'text-gray-300';
  return 'text-amber-400';
}

/** 从代理附加的 baseUrl 提取 host；端口优先使用 config.port。 */
function formatAddress(status: ServerStatus): string {
  let host = status.baseUrl;
  let basePort = '';

  try {
    const url = new URL(status.baseUrl);
    host = url.hostname;
    basePort = url.port;
  } catch {
    // baseUrl 已在服务端校验；这里只是为了让 UI 不因异常输入白屏。
  }

  const configPort = status.config?.port;
  const port =
    typeof configPort === 'number' && Number.isFinite(configPort)
      ? configPort
      : basePort
        ? Number(basePort)
        : null;

  return typeof port === 'number' && Number.isFinite(port) && port > 0
    ? `${host}:${port}`
    : host;
}

function describeError(code: string, tr: Translate): string {
  const label = ERROR_LABELS[code];
  return label ? tr(label) : tr('抓取失败（{code}）', { code });
}

function launchServer(serverId: string): void {
  // ticket 尚未实现（协议 v4 规划），先只传稳定的 server id。
  window.location.href = `rctmp://connect?server=${encodeURIComponent(serverId)}`;
}

function ServerCard({
  status,
  expanded,
  stale,
  onTogglePlayers,
}: {
  status: ServerStatus;
  expanded: boolean;
  stale: boolean;
  onTogglePlayers: () => void;
}) {
  const tr = useTr(EN);
  const capacity = status.capacity > 0 ? status.capacity : 0;
  const online = status.online > 0 ? status.online : 0;
  const percent = capacity > 0 ? Math.min(100, (online / capacity) * 100) : 0;
  const barColor =
    percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-blue-500';

  const visiblePlayers = expanded
    ? status.players
    : status.players.slice(0, PLAYER_PREVIEW_LIMIT);
  const canExpand = status.players.length > PLAYER_PREVIEW_LIMIT;
  // 最近一次刷新失败时状态已不可信，连接入口应先禁用，避免把玩家带到不可用的服务器。
  const connectDisabled = stale;

  return (
    <article className="overflow-hidden rounded-xl border border-gray-700 bg-[#2c2d31] shadow-lg shadow-black/20">
      <div className="border-b border-gray-700/70 p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusDot state={stale ? 'unknown' : 'online'} />
              <h2 className="break-words text-xl font-bold text-white md:text-2xl">
                {status.name}
              </h2>
              <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 font-mono text-[10px] text-gray-400">
                ID: {status.id}
              </span>
              {status.region ? (
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] text-blue-300">
                  {status.region}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>
                {tr('版本')}{' '}
                <span className="font-mono text-gray-300">{status.version ?? '—'}</span>
              </span>
              <span className="text-gray-700">·</span>
              <span>
                {tr('协议')}{' '}
                <span className="font-mono text-gray-300">
                  {status.protocolVersion === null ? '—' : `v${status.protocolVersion}`}
                </span>
              </span>
              <span className="text-gray-700">·</span>
              <span className="uppercase">{status.game ?? '—'}</span>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => launchServer(status.id)}
                disabled={connectDisabled}
                aria-disabled={connectDisabled}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:w-auto ${
                  connectDisabled
                    ? 'cursor-not-allowed border border-gray-700 bg-[#232428] text-gray-500 opacity-60'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {connectDisabled ? tr('连接启动器（状态未知）') : tr('连接启动器')}
              </button>
              <span className="text-[11px] text-gray-500">
                {connectDisabled
                  ? tr('服务器状态未知，暂时无法连接，请稍后再试')
                  : tr('需要已安装 RCTMP 启动器')}
              </span>
            </div>
          </div>

          <div className="w-full shrink-0 lg:w-72">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">{tr('在线玩家')}</span>
              <span className="text-[11px] text-gray-500">
                {capacity > 0 ? `${percent.toFixed(0)}%` : tr('容量未知')}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-black tabular-nums text-white">{online}</span>
              <span className="text-sm text-gray-500">
                / {capacity > 0 ? capacity : '—'}
              </span>
            </div>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full border border-gray-700/70 bg-[#18191c]"
              role="progressbar"
              aria-label={tr('{name} 在线人数', { name: status.name })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
            >
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-500`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={tr('运行时长')} value={humanizeDuration(status.uptimeSec, tr)} />
          <Stat
            label={tr('平均邻居')}
            value={
              status.avgNeighbors === null
                ? '—'
                : tr('{count} 人', { count: formatNumber(status.avgNeighbors, 1) })
            }
          />
          <Stat
            label={tr('Tick 延迟')}
            value={
              status.lastTickMs === null
                ? '—'
                : `${formatNumber(status.lastTickMs, 1)} ms`
            }
          />
          <Stat label={tr('地址')} value={formatAddress(status)} mono />
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-200">
            {tr('在线玩家')}
            <span className="ml-2 font-normal text-gray-500">
              {tr('{snapshots} 条快照 / 在线 {online} 人', {
                snapshots: status.players.length,
                online: status.online,
              })}
            </span>
          </h3>
          {canExpand ? (
            <button
              type="button"
              onClick={onTogglePlayers}
              className="rounded border border-gray-600 px-3 py-1 text-[11px] text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {expanded
                ? tr('收起')
                : tr('展开全部（{count}）', { count: status.players.length })}
            </button>
          ) : null}
        </div>

        {status.players.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-700 bg-[#232428] px-4 py-8 text-center text-sm text-gray-500">
            {tr('暂无可见的在线玩家')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-700/70 text-left text-[10px] uppercase tracking-wider text-gray-500">
                  <th scope="col" className="px-2 py-2 font-medium">
                    ID
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {tr('名称')}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Tag
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Ping
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {tr('在线时长')}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {tr('速度')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/40">
                {visiblePlayers.map((player, index) => {
                  const playerName =
                    typeof player.name === 'string' && player.name.trim()
                      ? player.name
                      : '—';
                  const playerTag =
                    typeof player.tag === 'string' && player.tag.trim()
                      ? player.tag
                      : null;
                  const playerAddr =
                    typeof player.addr === 'string' && player.addr
                      ? player.addr
                      : null;
                  const rawId: unknown = player.id;
                  const playerIdLabel =
                    typeof rawId === 'number' && Number.isFinite(rawId)
                      ? `#${rawId}`
                      : typeof rawId === 'string' && rawId.trim()
                        ? `#${rawId}`
                        : '#—';
                  const rowKey = `${status.id}-${index}-${
                    typeof rawId === 'string' || typeof rawId === 'number'
                      ? rawId
                      : 'unknown'
                  }`;

                  return (
                    <tr
                      key={rowKey}
                      className="transition hover:bg-white/[0.03]"
                    >
                      <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs text-gray-500">
                        {playerIdLabel}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="text-gray-200">{playerName}</span>
                        {playerAddr ? (
                          <span className="ml-2 font-mono text-[10px] text-gray-500">
                            {playerAddr}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">
                        {playerTag ? (
                          <span className="inline-flex rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">
                            {playerTag}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-2.5 font-mono text-xs ${pingColor(
                          player.ping
                        )}`}
                      >
                        {formatPing(player.ping)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs text-gray-400">
                        {humanizeDuration(player.connectedSec, tr)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-xs text-gray-300">
                        {formatSpeed(player.pos?.kmh)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {status.online > status.players.length ? (
          <p className="mt-2 text-[11px] text-gray-500">
            {tr('服务端返回了 {shown} 条玩家明细，少于在线人数 {online}。', {
              shown: status.players.length,
              online: status.online,
            })}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function OfflineServerCard({ id, error }: { id: string; error: string }) {
  const tr = useTr(EN);
  return (
    <article className="rounded-xl border border-red-900/50 bg-[#2c2d31] p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusDot state="offline" />
        <h2 className="break-words text-xl font-bold text-white">{id}</h2>
        <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 font-mono text-[10px] text-gray-400">
          ID: {id}
        </span>
      </div>

      <p className="mt-3 text-sm text-red-300">{describeError(error, tr)}</p>
      <p className="mt-1 break-all font-mono text-[11px] text-gray-500">
        {tr('错误码：{code}', { code: error })}
      </p>
      <p className="mt-3 text-xs text-gray-500">
        {tr('该服务器本轮状态刷新失败；其它服务器不受影响，页面会每 5 秒自动重试。')}
      </p>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-gray-700 bg-[#232428] px-4 py-2 text-sm font-bold text-gray-500 opacity-60"
      >
        {tr('连接启动器（离线）')}
      </button>
    </article>
  );
}

function LoadingState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      <p className="mt-4 text-sm text-gray-400">{tr('正在获取服务器状态…')}</p>
    </div>
  );
}

function UnconfiguredState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-8 text-center md:p-12">
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
            d="M5 12H3m18 0h-2M7.5 7.5 6 6m12 12-1.5-1.5M12 5V3m0 18v-2m4.5-11.5L18 6M6 18l1.5-1.5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-bold text-white">{tr('服务器即将开放，敬请期待')}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        {tr('游戏服务端正在测试中。开放后这里会展示各服务器的实时状态、在线玩家与启动器连接入口。')}
      </p>
      <p className="mt-3 text-xs text-gray-600">{tr('请稍后再来看看，感谢你的耐心等待。')}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-red-900/60 bg-[#2c2d31] p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 font-mono text-lg font-bold text-red-300">
        !
      </div>
      <h2 className="mt-4 text-lg font-bold text-white">{tr('暂时无法获取服务器状态')}</h2>
      <p className="mt-2 break-all text-sm text-gray-400">{message}</p>
      <p className="mt-2 text-xs text-gray-500">
        {tr('页面会每 5 秒自动重试；也可以点击下方按钮立即重试。')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {tr('立即重试')}
      </button>
    </div>
  );
}

function EmptyState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-8 text-center md:p-10">
      <p className="text-base font-bold text-white">{tr('当前暂无在线服务器')}</p>
      <p className="mt-2 text-sm text-gray-500">
        {tr('服务器可能正在维护或尚未开放，请稍后再来看看。')}
      </p>
    </div>
  );
}

export default function ServersPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const [payload, setPayload] = useState<ServersStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const response = await fetch('/api/servers/status?full=1', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(
            translateNow(locale, '服务暂时不可用（HTTP {status}）', { status: response.status })
          );
        }

        const data: unknown = await response.json();
        if (!isServersStatusPayload(data)) {
          throw new Error(translateNow(locale, '服务器状态数据异常'));
        }
        if (cancelled) return;

        setPayload(data);
        setLastUpdated(new Date(data.fetchedAt));
        setFetchError(null);
      } catch (error) {
        if (cancelled) return;
        setFetchError(
          error instanceof Error ? error.message : translateNow(locale, '未知错误')
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const stopTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const startTimer = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        void load();
      }, REFRESH_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void load();
        startTimer();
      } else {
        stopTimer();
      }
    };

    void load();
    if (document.visibilityState === 'visible') {
      startTimer();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [reloadToken, locale]);

  const servers = payload?.servers ?? [];
  const errors = payload?.errors ?? [];
  const configured = payload?.configured !== false;
  const allOffline = payload !== null && configured && servers.length === 0 && errors.length > 0;
  const isEmpty =
    payload !== null && configured && servers.length === 0 && errors.length === 0;

  const refreshNow = () => {
    setReloadToken((value) => value + 1);
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-4 border-b border-gray-700 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">
                {tr('服务器列表')}
              </h1>
              <span className="text-lg font-bold text-gray-500 md:text-xl">
                / Server List
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              {tr('查看 RCTMP 游戏服务器实时状态、在线玩家与连接入口。数据由本站服务端代理抓取，每 5 秒自动刷新，页面隐藏时暂停。')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  fetchError
                    ? 'bg-amber-500'
                    : loading
                      ? 'bg-gray-500'
                      : 'bg-emerald-500 animate-pulse'
                }`}
              />
              {fetchError
                ? tr('自动刷新异常，正在重试')
                : loading
                  ? tr('正在获取服务器状态')
                  : tr('数据已更新')}
            </span>
            <span className="text-gray-700">·</span>
            <span>
              {tr('最后更新')}{' '}
              <span className="font-mono text-gray-300">{formatClock(lastUpdated)}</span>
            </span>
            <button
              type="button"
              onClick={refreshNow}
              className="rounded border border-gray-600 px-2.5 py-1 text-[11px] text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {tr('立即刷新')}
            </button>
          </div>
        </div>

        {loading && payload === null ? (
          <LoadingState />
        ) : payload === null ? (
          <ErrorState message={fetchError ?? tr('未知错误')} onRetry={refreshNow} />
        ) : payload.configured === false ? (
          <UnconfiguredState />
        ) : (
          <>
            {fetchError ? (
              <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="font-bold">{tr('自动刷新失败')}</p>
                <p className="mt-1 text-xs text-amber-200/80">
                  {tr('当前显示的是上次成功获取的数据，页面会每 5 秒继续重试。')}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-amber-200/60">
                  {fetchError}
                </p>
              </div>
            ) : null}

            {allOffline ? (
              <div className="mb-5 rounded-lg border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                <span className="font-bold">{tr('所有服务器当前均离线。')}</span>
                <span className="ml-1 text-red-200/70">
                  {tr('暂时无法获取实时状态，详情见下方提示。')}
                </span>
              </div>
            ) : null}

            {servers.length > 0 ? (
              <div className="space-y-6">
                {servers.map((status) => (
                  <ServerCard
                    key={status.id}
                    status={status}
                    expanded={expandedServers[status.id] === true}
                    stale={fetchError !== null}
                    onTogglePlayers={() => {
                      setExpandedServers((current) => ({
                        ...current,
                        [status.id]: !current[status.id],
                      }));
                    }}
                  />
                ))}
              </div>
            ) : null}

            {errors.length > 0 ? (
              <div className={`space-y-4 ${servers.length > 0 ? 'mt-6' : ''}`}>
                {errors.map((entry) => (
                  <OfflineServerCard key={entry.id} id={entry.id} error={entry.error} />
                ))}
              </div>
            ) : null}

            {isEmpty ? <EmptyState /> : null}

            <p className="mt-6 text-center text-[11px] leading-5 text-gray-600">
              {tr('数据由本站服务端定时获取，仅供参考；实际连接以启动器校验结果为准。')}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
