// app/recruitment/page.tsx
// 公开招募页：展示 recruitment_settings（单行）中的文案与职位，并允许已登录且
// 通过 Steam 验证的玩家提交 recruitment_applications。页面只读设置，不提供管理入口。
// 数据库侧约束（前端不重复实现，仅做提示与错误兜底）：
//   · recruitment_settings 匿名可读；
//   · INSERT 要求 user_id = auth.uid()、rct_is_steam_verified() 且 is_open = true；
//   · 同一用户同时只能有一条 pending/reviewing 申请，重复插入返回 23505。
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DEFAULT_TITLE = '加入 RCT MP 团队';
const MAX_APPLICATIONS = 10;
const MAX_CONTACT = 120;
const MAX_MESSAGE = 1000;

type ApplicationStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected';

interface RecruitmentSettings {
  is_open: boolean;
  title: string;
  intro: string;
  requirements: string;
  positions: string;
  updated_at: string | null;
}

interface PositionInfo {
  title: string;
  department: string | null;
  description: string | null;
}

interface ApplicationRow {
  id: string;
  position: string;
  status: ApplicationStatus;
  handle_note: string | null;
  created_at: string;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface DbErrorInfo {
  code: string | null;
  message: string;
}

const DEFAULT_SETTINGS: RecruitmentSettings = {
  is_open: false,
  title: DEFAULT_TITLE,
  intro: '',
  requirements: '',
  positions: '',
  updated_at: null,
};

const STATUS_META: Record<ApplicationStatus, { label: string; className: string }> = {
  pending: { label: '待处理', className: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  reviewing: { label: '审核中', className: 'border-blue-500/40 bg-blue-500/15 text-blue-300' },
  accepted: { label: '已通过', className: 'border-green-500/40 bg-green-500/15 text-green-300' },
  rejected: { label: '未通过', className: 'border-gray-600 bg-[#232428] text-gray-400' },
};

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm text-gray-400';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function errorMessage(error: unknown): string {
  if (isRecord(error)) {
    const message = asText(error.message);
    if (message && message.trim()) return message;
  }
  return '操作失败，请稍后重试';
}

/**
 * 设置行缺失或字段异常时退回「暂未开放」的安全默认值，
 * 避免因为文案问题让页面整体崩掉。
 */
function toSettings(raw: unknown): RecruitmentSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;

  return {
    is_open: raw.is_open === true,
    title: asText(raw.title)?.trim() || DEFAULT_TITLE,
    intro: asText(raw.intro) ?? '',
    requirements: asText(raw.requirements) ?? '',
    positions: asText(raw.positions) ?? '',
    updated_at: asText(raw.updated_at),
  };
}

/**
 * positions 每行一个职位，格式为「职位 | 部门 | 说明」。
 * 字段缺失时容错：只有职位也可解析；说明中多余的 | 会重新拼接。
 */
function parsePositions(raw: string): PositionInfo[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [rawTitle = '', rawDepartment = '', ...rest] = line
        .split('|')
        .map((part) => part.trim());
      const title = rawTitle.trim();
      if (!title) return null;

      return {
        title,
        department: rawDepartment || null,
        description: rest.join(' | ').trim() || null,
      };
    })
    .filter((item): item is PositionInfo => item !== null);
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return value === 'pending' || value === 'reviewing' || value === 'accepted' || value === 'rejected';
}

function toApplicationRow(raw: unknown): ApplicationRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  const createdAt = asText(raw.created_at);
  if (!id || !createdAt) return null;

  return {
    id,
    position: asText(raw.position)?.trim() || '未填写职位',
    status: isApplicationStatus(raw.status) ? raw.status : 'pending',
    handle_note:
      typeof raw.handle_note === 'string' && raw.handle_note.trim() ? raw.handle_note.trim() : null,
    created_at: createdAt,
  };
}

function toApplicationRows(data: unknown): ApplicationRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toApplicationRow).filter((row): row is ApplicationRow => row !== null);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function toDbErrorInfo(error: unknown): DbErrorInfo {
  if (isRecord(error)) {
    const message = asText(error.message)?.trim();
    return {
      code: asText(error.code),
      message: message || '提交失败，请稍后重试。',
    };
  }
  return { code: null, message: '提交失败，请稍后重试。' };
}

/** 把数据库错误翻译成玩家能理解的中文提示。 */
function submitErrorText(error: unknown): string {
  const info = toDbErrorInfo(error);

  if (info.code === '23505' || /duplicate key|unique constraint/i.test(info.message)) {
    return '你已有一条待处理的申请，请等待审核';
  }

  if (info.code === '42501' || /row-level security|policy|permission|not authorized/i.test(info.message)) {
    return '提交被拒绝：请先完成 Steam 验证后再申请（需绑定正版 Steam 账号）。';
  }

  return `提交失败：${info.message}`;
}

export default function RecruitmentPage() {
  const [settings, setSettings] = useState<RecruitmentSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsReload, setSettingsReload] = useState(0);

  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [steamVerified, setSteamVerified] = useState<boolean | null>(null);

  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  // 登录后列表立即进入加载态，避免先闪一帧「还没有申请」。
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsReload, setApplicationsReload] = useState(0);

  const [position, setPosition] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 1. 招募设置（匿名可读，无需登录）
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setSettingsLoading(true);
      setSettingsError(null);

      try {
        const { data, error } = await supabase
          .from('recruitment_settings')
          .select('is_open,title,intro,requirements,positions,updated_at')
          .eq('id', 1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setSettingsError(error.message);
          setSettings(null);
          return;
        }

        const nextSettings = toSettings(data);
        setSettings(nextSettings);

        const firstPosition = parsePositions(nextSettings.positions)[0]?.title ?? '';
        setPosition((current) => current || firstPosition);
      } catch (error) {
        if (!cancelled) {
          setSettingsError(errorMessage(error));
          setSettings(null);
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [settingsReload]);

  // 2. 登录状态 + Steam 验证状态（仅作提示，最终以数据库 RLS 为准）
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!user) {
          setUserId(null);
          setSteamVerified(null);
          return;
        }

        setUserId(user.id);

        const { data, error } = await supabase
          .from('profiles')
          .select('steam_verified')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;
        setSteamVerified(
          !error && isRecord(data) && typeof data.steam_verified === 'boolean'
            ? data.steam_verified
            : null
        );
      } catch {
        if (!cancelled) {
          setUserId(null);
          setSteamVerified(null);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // 3. 我的申请（登录后显示，最近 10 条）
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      setApplicationsLoading(true);
      setApplicationsError(null);

      try {
        const { data, error } = await supabase
          .from('recruitment_applications')
          .select('id,position,status,handle_note,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_APPLICATIONS);

        if (cancelled) return;

        if (error) {
          setApplicationsError(error.message);
          setApplications([]);
          return;
        }

        setApplications(toApplicationRows(data));
      } catch (error) {
        if (!cancelled) {
          setApplicationsError(errorMessage(error));
          setApplications([]);
        }
      } finally {
        if (!cancelled) setApplicationsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, applicationsReload]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!settings?.is_open) {
      setNotice({ kind: 'error', text: '招募当前未开放，暂时无法提交申请。' });
      return;
    }

    if (!userId) {
      setNotice({ kind: 'error', text: '登录状态已失效，请重新登录后再提交。' });
      return;
    }

    const trimmedPosition = position.trim();
    const trimmedContact = contact.trim();
    const trimmedMessage = message.trim();

    if (!trimmedPosition) {
      setNotice({ kind: 'error', text: '请选择或填写申请职位。' });
      return;
    }
    if (trimmedContact.length > MAX_CONTACT) {
      setNotice({ kind: 'error', text: `联系方式不能超过 ${MAX_CONTACT} 字。` });
      return;
    }
    if (!trimmedMessage) {
      setNotice({ kind: 'error', text: '请填写申请说明。' });
      return;
    }
    if (trimmedMessage.length > MAX_MESSAGE) {
      setNotice({ kind: 'error', text: `申请说明不能超过 ${MAX_MESSAGE} 字。` });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const { error } = await supabase.from('recruitment_applications').insert({
        user_id: userId,
        position: trimmedPosition,
        contact: trimmedContact || null,
        message: trimmedMessage,
      });

      if (error) {
        setNotice({ kind: 'error', text: submitErrorText(error) });
        return;
      }

      setPosition('');
      setContact('');
      setMessage('');
      setNotice({
        kind: 'success',
        text: '✅ 申请已提交，我们会尽快审核。你可以在下方「我的申请」中查看进度。',
      });
      setApplicationsReload((value) => value + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: submitErrorText(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const currentSettings = settings ?? DEFAULT_SETTINGS;
  const isOpen = currentSettings.is_open;
  const positions = parsePositions(currentSettings.positions);
  const positionOptions = Array.from(new Set(positions.map((item) => item.title)));

  return (
    <div className="min-h-screen bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
        <header className="mb-8 border-b border-gray-700 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{currentSettings.title}</h1>
            {settingsLoading ? (
              <span className="inline-flex items-center rounded border border-gray-600 bg-[#232428] px-2.5 py-1 text-xs font-bold text-gray-400">
                加载中
              </span>
            ) : (
              <span
                className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-bold ${
                  isOpen
                    ? 'border-green-500/40 bg-green-500/15 text-green-300'
                    : 'border-gray-600 bg-[#232428] text-gray-400'
                }`}
              >
                {isOpen ? '招募中' : '暂未开放'}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-500">
            加入 RCT MP 团队，和一群热爱欧卡2的玩家一起运营社区、组织联运。
          </p>
        </header>

        {settingsLoading ? (
          <div className="rounded-xl border border-gray-700 bg-[#2c2d31] px-6 py-16 text-center text-sm text-gray-500 shadow-lg">
            正在加载招募信息...
          </div>
        ) : settingsError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-10 text-center shadow-lg"
          >
            <p className="text-sm text-red-300">加载招募信息失败：{settingsError}</p>
            <button
              type="button"
              onClick={() => setSettingsReload((value) => value + 1)}
              className="mt-5 rounded bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            {!isOpen && (
              <section className="mb-6 rounded-xl border border-gray-700 bg-[#2c2d31] p-6 text-center shadow-lg">
                <div className="text-3xl">📢</div>
                <h2 className="mt-2 text-lg font-bold text-white">招募暂未开放</h2>
                <p className="mt-2 text-sm text-gray-400">招募暂未开放，请关注新闻公告。</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/news"
                    className="rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    查看新闻公告
                  </Link>
                  <Link
                    href="/team"
                    className="rounded border border-gray-600 bg-[#232428] px-5 py-2 text-sm font-bold text-gray-200 transition hover:border-gray-500"
                  >
                    了解现有团队
                  </Link>
                </div>
              </section>
            )}

            {currentSettings.intro.trim() && (
              <section className="mt-6 rounded-xl border border-gray-700 bg-[#2c2d31] p-5 shadow-lg md:p-6">
                <h2 className="text-lg font-bold text-white">关于招募</h2>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-300">
                  {currentSettings.intro}
                </p>
              </section>
            )}

            {currentSettings.requirements.trim() && (
              <section className="mt-6 rounded-xl border border-gray-700 bg-[#2c2d31] p-5 shadow-lg md:p-6">
                <h2 className="text-lg font-bold text-white">申请要求</h2>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-300">
                  {currentSettings.requirements}
                </p>
              </section>
            )}

            <section className="mt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-white">开放职位</h2>
                {positions.length > 0 && (
                  <span className="text-xs text-gray-500">共 {positions.length} 个职位</span>
                )}
              </div>

              {positions.length === 0 ? (
                <p className="rounded-xl border border-gray-700 bg-[#232428] px-4 py-8 text-center text-sm text-gray-500">
                  暂无职位信息，请关注后续公告。
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {positions.map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-white">{item.title}</h3>
                        {item.department && (
                          <span className="rounded border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300">
                            {item.department}
                          </span>
                        )}
                      </div>
                      {item.description ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-400">
                          {item.description}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">职位说明待补充。</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isOpen && (
              <section id="apply" className="mt-8">
                <h2 className="text-xl font-bold text-white">提交申请</h2>

                <div className="mt-4 rounded-xl border border-gray-700 bg-[#2c2d31] p-5 shadow-lg md:p-6">
                  {authLoading ? (
                    <p className="py-6 text-center text-sm text-gray-500">正在确认登录状态...</p>
                  ) : !userId ? (
                    <div className="py-4 text-center">
                      <p className="text-sm text-gray-300">请先登录后申请。</p>
                      <Link
                        href="/login"
                        className="mt-5 inline-block rounded bg-blue-600 px-6 py-2.5 font-bold text-white transition hover:bg-blue-700"
                      >
                        前往登录
                      </Link>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                      {steamVerified === false && (
                        <p className="rounded border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
                          你的账号尚未完成 Steam 验证，提交前请先在{' '}
                          <Link href="/profile" className="underline hover:text-orange-200">
                            个人资料
                          </Link>{' '}
                          完成验证。
                        </p>
                      )}

                      <div>
                        <label htmlFor="recruitment-position" className={labelClass}>
                          申请职位 <span className="text-red-400">*</span>
                        </label>
                        {positionOptions.length > 0 ? (
                          <select
                            id="recruitment-position"
                            value={position}
                            onChange={(event) => setPosition(event.target.value)}
                            className={inputClass}
                            required
                          >
                            <option value="">请选择职位</option>
                            {positionOptions.map((title) => (
                              <option key={title} value={title}>
                                {title}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id="recruitment-position"
                            type="text"
                            value={position}
                            onChange={(event) => setPosition(event.target.value)}
                            className={inputClass}
                            placeholder="例如：社区版主"
                            maxLength={80}
                            required
                          />
                        )}
                      </div>

                      <div>
                        <label htmlFor="recruitment-contact" className={labelClass}>
                          联系方式（选填）
                        </label>
                        <input
                          id="recruitment-contact"
                          type="text"
                          value={contact}
                          onChange={(event) => setContact(event.target.value)}
                          className={inputClass}
                          placeholder="邮箱 / Discord / QQ 等"
                          maxLength={MAX_CONTACT}
                        />
                        <div className="mt-1 flex justify-end text-xs text-gray-500">
                          <span className={contact.length >= MAX_CONTACT ? 'text-orange-400' : ''}>
                            {contact.length}/{MAX_CONTACT}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="recruitment-message" className={labelClass}>
                          申请说明 <span className="text-red-400">*</span>
                        </label>
                        <textarea
                          id="recruitment-message"
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          className={`${inputClass} min-h-[140px] resize-y`}
                          rows={6}
                          maxLength={MAX_MESSAGE}
                          required
                          placeholder="请介绍你的游戏时长、可投入时间、相关经验，以及想加入这个职位的原因。"
                        />
                        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                          <span>请如实填写，方便我们评估。</span>
                          <span className={message.length >= MAX_MESSAGE ? 'text-orange-400' : ''}>
                            {message.length}/{MAX_MESSAGE}
                          </span>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting ? '提交中...' : '提交申请'}
                      </button>

                      {notice && (
                        <p
                          role="status"
                          aria-live="polite"
                          className={`whitespace-pre-line rounded border px-4 py-3 text-sm ${
                            notice.kind === 'success'
                              ? 'border-green-500/40 bg-green-500/10 text-green-300'
                              : 'border-red-500/40 bg-red-500/10 text-red-300'
                          }`}
                        >
                          {notice.text}
                        </p>
                      )}
                    </form>
                  )}
                </div>
              </section>
            )}

            {userId && (
              <section className="mt-10">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-white">我的申请</h2>
                  <button
                    type="button"
                    onClick={() => setApplicationsReload((value) => value + 1)}
                    disabled={applicationsLoading}
                    className="text-sm text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
                  >
                    {applicationsLoading ? '刷新中...' : '刷新'}
                  </button>
                </div>

                {applicationsError && (
                  <p
                    role="alert"
                    className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                  >
                    加载失败：{applicationsError}
                  </p>
                )}

                {applicationsLoading ? (
                  <p className="py-8 text-center text-sm text-gray-500">加载中...</p>
                ) : applicationsError ? null : applications.length === 0 ? (
                  <p className="rounded border border-gray-700 bg-[#232428] px-4 py-8 text-center text-sm text-gray-500">
                    你还没有提交过申请。
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {applications.map((application) => {
                      const meta = STATUS_META[application.status];
                      return (
                        <li
                          key={application.id}
                          className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {application.position}
                            </span>
                            <span
                              className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                            <span className="ml-auto text-xs text-gray-500">
                              {formatTime(application.created_at)}
                            </span>
                          </div>

                          {application.handle_note && (
                            <p className="mt-3 whitespace-pre-wrap break-words rounded border border-gray-700 bg-[#232428] px-3 py-2 text-xs text-gray-300">
                              处理备注：{application.handle_note}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {applications.length >= MAX_APPLICATIONS && (
                  <p className="mt-3 text-center text-xs text-gray-500">
                    仅显示最近 {MAX_APPLICATIONS} 条申请。
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
