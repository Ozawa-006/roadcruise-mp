// app/recruitment/page.tsx
// 公开招募页（RCT MP）。
//
// 数据流（只读公开表 + 登录用户自己的申请）：
//   1. recruitment_settings（id=1）→ 总开关 is_open / 标题 / 介绍 / 要求；
//   2. recruitment_positions      → 职位、独立 is_open、排序、每个职位的专属 questions；
//   3. supabase.auth.getUser()    → 申请表单与「我的申请」的登录态；
//   4. recruitment_applications   → 提交申请、读取本人最近 10 条申请。
//
// 数据库是唯一事实来源：本页不修改设置、不写 SQL、不重复实现 RLS；
// 提交前只做前端必填校验，并把数据库错误翻译成玩家可读的提示。
// 已知约束（由数据库保证）：
//   · INSERT 要求登录 + Steam 已验证 + recruitment_settings.is_open + 该职位 is_open；
//   · 同一用户同一职位同时只能有一条 pending/reviewing 申请（重复插入 23505 / 409）；
//   · RLS 只允许登录用户 SELECT 自己的申请；
//   · positions.questions 为 jsonb 数组，单项形如
//     { id, label, type: 'text'|'textarea'|'select', required, options? }。
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

type ApplicationStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected';
type RecruitStatus = 'open' | 'closed' | 'empty';
type QuestionType = 'text' | 'textarea' | 'select';

interface RecruitmentSettings {
  is_open: boolean;
  title: string;
  intro: string;
  requirements: string;
}

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
}

interface Position {
  id: number;
  name: string;
  department: string;
  description: string;
  questions: Question[];
  is_open: boolean;
  sort_order: number;
}

interface ApplicationRow {
  id: string;
  position_id: number | null;
  position: string;
  contact: string | null;
  answers: Record<string, string>;
  status: ApplicationStatus;
  handle_note: string | null;
  created_at: string;
}

interface AnswerItem {
  id: string;
  label: string;
  value: string;
}

interface SuccessNotice {
  positionId: number;
  text: string;
}

interface DbErrorInfo {
  code: string | null;
  status: number | null;
  message: string;
}

const DEFAULT_SETTINGS: RecruitmentSettings = {
  is_open: false,
  title: DEFAULT_TITLE,
  intro: '',
  requirements: '',
};

const STATUS_META: Record<ApplicationStatus, { label: string; className: string }> = {
  pending: {
    label: '待处理',
    className: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  },
  reviewing: {
    label: '审核中',
    className: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  },
  accepted: {
    label: '已通过',
    className: 'border-green-500/40 bg-green-500/15 text-green-300',
  },
  rejected: {
    label: '未通过',
    className: 'border-gray-600 bg-[#232428] text-gray-400',
  },
};

const RECRUIT_STATUS_META: Record<RecruitStatus, { label: string; className: string }> = {
  open: {
    label: '招募中',
    className: 'border-green-500/40 bg-green-500/15 text-green-300',
  },
  closed: {
    label: '招募暂未开放',
    className: 'border-gray-600 bg-[#232428] text-gray-400',
  },
  empty: {
    label: '暂无开放职位',
    className: 'border-gray-600 bg-[#232428] text-gray-400',
  },
};

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'mb-1 block text-sm text-gray-400';
const primaryButtonClass =
  'rounded bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'rounded border border-gray-600 bg-[#232428] px-6 py-2.5 text-sm font-bold text-gray-200 transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50';
const ctaPrimaryClass =
  'rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700';
const ctaSecondaryClass =
  'rounded border border-gray-600 bg-[#232428] px-5 py-2 text-sm font-bold text-gray-200 transition hover:border-gray-500';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (isRecord(error)) {
    const message = asText(error.message);
    if (message && message.trim()) return message.trim();
  }
  return '加载失败，请稍后重试';
}

function toSettings(raw: unknown): RecruitmentSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;

  return {
    is_open: raw.is_open === true,
    title: asText(raw.title)?.trim() || DEFAULT_TITLE,
    intro: asText(raw.intro) ?? '',
    requirements: asText(raw.requirements) ?? '',
  };
}

function isQuestionType(value: unknown): value is QuestionType {
  return value === 'text' || value === 'textarea' || value === 'select';
}

function toQuestion(raw: unknown): Question | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id)?.trim();
  const label = asText(raw.label)?.trim();
  if (!id || !label) return null;

  const options = Array.isArray(raw.options)
    ? Array.from(
        new Set(
          raw.options
            .map((option) => asText(option)?.trim() ?? '')
            .filter((option) => option.length > 0)
        )
      )
    : [];

  return {
    id,
    label,
    type: isQuestionType(raw.type) ? raw.type : 'text',
    required: raw.required === true,
    options,
  };
}

function toQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  const rows: unknown[] = raw;
  return rows.map(toQuestion).filter((question): question is Question => question !== null);
}

function toPosition(raw: unknown): Position | null {
  if (!isRecord(raw)) return null;

  const id = asId(raw.id);
  const name = asText(raw.name)?.trim();
  if (id === null || !name) return null;

  const sortOrder = typeof raw.sort_order === 'number' ? raw.sort_order : Number(raw.sort_order);

  return {
    id,
    name,
    department: (asText(raw.department) ?? '').trim(),
    description: asText(raw.description) ?? '',
    questions: toQuestions(raw.questions),
    is_open: raw.is_open === true,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

function toPositions(data: unknown): Position[] {
  if (!Array.isArray(data)) return [];
  const rows: unknown[] = data;
  return rows
    .map(toPosition)
    .filter((position): position is Position => position !== null)
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    value === 'pending' ||
    value === 'reviewing' ||
    value === 'accepted' ||
    value === 'rejected'
  );
}

function toAnswers(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};

  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const text = asText(value);
    if (text !== null) answers[key] = text;
  }
  return answers;
}

function toApplicationRow(raw: unknown): ApplicationRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id)?.trim();
  const createdAt = asText(raw.created_at);
  if (!id || !createdAt) return null;

  return {
    id,
    position_id: asId(raw.position_id),
    position: asText(raw.position)?.trim() || '未填写职位',
    contact: typeof raw.contact === 'string' && raw.contact.trim() ? raw.contact : null,
    answers: toAnswers(raw.answers),
    status: isApplicationStatus(raw.status) ? raw.status : 'pending',
    handle_note:
      typeof raw.handle_note === 'string' && raw.handle_note.trim() ? raw.handle_note : null,
    created_at: createdAt,
  };
}

function toApplicationRows(data: unknown): ApplicationRow[] {
  if (!Array.isArray(data)) return [];
  const rows: unknown[] = data;
  return rows.map(toApplicationRow).filter((row): row is ApplicationRow => row !== null);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function toDbErrorInfo(error: unknown): DbErrorInfo {
  if (!isRecord(error)) return { code: null, status: null, message: '' };

  const rawStatus = error.status;
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string' && rawStatus.trim() !== ''
        ? Number(rawStatus)
        : null;

  return {
    code: asText(error.code),
    status: status !== null && Number.isFinite(status) ? status : null,
    message: asText(error.message)?.trim() ?? '',
  };
}

/** 把数据库/网络错误翻译成玩家能理解的提示；其余错误保留 error.message。 */
function submitErrorText(error: unknown): string {
  const info = toDbErrorInfo(error);

  if (
    info.code === '23505' ||
    info.status === 409 ||
    /duplicate key|unique constraint/i.test(info.message)
  ) {
    return '你已申请过该职位，请等待审核';
  }

  if (
    info.code === '42501' ||
    info.status === 403 ||
    /row-level security|permission denied|not authorized|policy/i.test(info.message)
  ) {
    return '该职位已关闭或你尚未通过 Steam 验证';
  }

  return info.message || '提交失败，请稍后重试';
}

/**
 * 把 answers 映射为可展示的条目：
 *   · 职位仍存在 → 按职位当前 questions 的顺序与 label 展示；
 *   · 职位已删除（position_id 为空或查不到）→ 直接显示 question id；
 *   · 职位存在但问题后来被删掉 → 该答案回退显示 question id。
 * 空字符串不展示，避免出现大量「未填写」噪音。
 */
function buildAnswerItems(
  answers: Record<string, string>,
  position: Position | undefined
): AnswerItem[] {
  const items: AnswerItem[] = [];
  const used = new Set<string>();

  if (position) {
    for (const question of position.questions) {
      const value = answers[question.id];
      if (typeof value === 'string' && value !== '') {
        items.push({ id: question.id, label: question.label, value });
        used.add(question.id);
      }
    }
  }

  for (const [id, value] of Object.entries(answers)) {
    if (used.has(id) || value === '') continue;
    items.push({ id, label: id, value });
  }

  return items;
}

export default function RecruitmentPage() {
  // 公开数据：设置 + 职位
  const [settings, setSettings] = useState<RecruitmentSettings | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageReload, setPageReload] = useState(0);

  // 登录态
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 申请表单（同一时间只选中一个职位）
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessNotice | null>(null);

  // 我的申请
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsReload, setApplicationsReload] = useState(0);
  const [expandedApplications, setExpandedApplications] = useState<Record<string, boolean>>({});

  // 1. 公开数据：设置行 + 全部职位（匿名可读，按 sort_order / id 排序）。
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPageLoading(true);
      setPageError(null);

      try {
        const [settingsResult, positionsResult] = await Promise.all([
          supabase
            .from('recruitment_settings')
            .select('is_open,title,intro,requirements')
            .eq('id', 1)
            .maybeSingle(),
          supabase
            .from('recruitment_positions')
            .select('id,name,department,description,questions,is_open,sort_order')
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true }),
        ]);

        if (cancelled) return;

        if (settingsResult.error || positionsResult.error) {
          setPageError(
            settingsResult.error?.message ??
              positionsResult.error?.message ??
              '加载失败，请稍后重试'
          );
          setSettings(null);
          setPositions([]);
          return;
        }

        // 设置行缺失时按「未开放」处理，页面仍可展示职位与说明。
        setSettings(toSettings(settingsResult.data));
        setPositions(toPositions(positionsResult.data));

        // 数据刷新后收起旧表单，避免用过期职位提交。
        setSelectedPositionId(null);
        setAnswers({});
        setFormError(null);
        setSuccess(null);
        setExpandedApplications({});
      } catch (error) {
        if (!cancelled) {
          setPageError(errorMessage(error));
          setSettings(null);
          setPositions([]);
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [pageReload]);

  // 2. 登录态：先 getUser，再监听登录/退出，保证表单与「我的申请」同步。
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setUserId(user?.id ?? null);
      } catch {
        if (!cancelled) setUserId(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    void init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  // 3. 我的申请：登录后读取最近 10 条（RLS 只返回本人数据）。
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      setApplicationsLoading(true);
      setApplicationsError(null);

      try {
        const { data, error } = await supabase
          .from('recruitment_applications')
          .select('id,position_id,position,contact,answers,status,handle_note,created_at')
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

  const currentSettings = settings ?? DEFAULT_SETTINGS;
  const isOpen = currentSettings.is_open;
  // 总开关关闭时，即使职位行 is_open=true 也不对外展示为「开放中」。
  const openPositionCount = isOpen
    ? positions.filter((position) => position.is_open).length
    : 0;
  const hasOpenPosition = openPositionCount > 0;
  const recruitStatus: RecruitStatus = !isOpen
    ? 'closed'
    : openPositionCount > 0
      ? 'open'
      : 'empty';
  const headerBadge = pageLoading
    ? { label: '加载中', className: RECRUIT_STATUS_META.closed.className }
    : pageError
      ? { label: '加载失败', className: RECRUIT_STATUS_META.closed.className }
      : RECRUIT_STATUS_META[recruitStatus];

  const selectedPosition =
    selectedPositionId === null
      ? null
      : (positions.find((position) => position.id === selectedPositionId) ?? null);
  // 只有「总开关开启 + 该职位 is_open」时才能看到/提交申请表单。
  const activePosition =
    selectedPosition && isOpen && selectedPosition.is_open ? selectedPosition : null;

  const positionById = new Map<number, Position>(
    positions.map((position) => [position.id, position])
  );

  const togglePosition = (position: Position) => {
    if (submitting) return;

    setFormError(null);
    setSuccess(null);

    if (selectedPositionId === position.id) {
      setSelectedPositionId(null);
      setAnswers({});
      return;
    }

    setSelectedPositionId(position.id);
    // 不同职位的问题 id 可能重复，切换职位时清空答案，避免串题。
    setAnswers({});
  };

  const closeForm = () => {
    if (submitting) return;
    setSelectedPositionId(null);
    setAnswers({});
    setFormError(null);
  };

  const updateAnswer = (questionId: string, value: string) => {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
    setFormError(null);
  };

  const toggleApplication = (applicationId: string) => {
    setExpandedApplications((previous) => ({
      ...previous,
      [applicationId]: !previous[applicationId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!activePosition) {
      setFormError('该职位已关闭，请刷新页面后重试。');
      return;
    }

    if (!userId) {
      setFormError('请先登录后申请');
      return;
    }

    const trimmedContact = contact.trim();
    if (trimmedContact.length > MAX_CONTACT) {
      setFormError(`联系方式不能超过 ${MAX_CONTACT} 个字。`);
      return;
    }

    // 收集 answers：必填项前端校验非空；可选留空不写入，避免空字符串噪音。
    const collected: Record<string, string> = {};
    for (const question of activePosition.questions) {
      const value = (answers[question.id] ?? '').trim();
      if (question.required && value === '') {
        setFormError(`请填写「${question.label}」`);
        return;
      }
      if (value !== '') collected[question.id] = value;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const { error } = await supabase.from('recruitment_applications').insert({
        user_id: userId,
        position_id: activePosition.id,
        position: activePosition.name,
        contact: trimmedContact === '' ? null : trimmedContact,
        answers: collected,
      });

      if (error) {
        setFormError(submitErrorText(error));
        return;
      }

      const appliedName = activePosition.name;
      const appliedId = activePosition.id;

      setAnswers({});
      setContact('');
      setSelectedPositionId(null);
      setSuccess({
        positionId: appliedId,
        text: `✅ 已成功申请「${appliedName}」，我们会尽快审核，请留意通知。`,
      });
      setApplicationsReload((value) => value + 1);
    } catch (error) {
      setFormError(submitErrorText(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
        <header className="mb-8 border-b border-gray-700 pb-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
            Recruitment
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{currentSettings.title}</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold ${headerBadge.className}`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  !pageLoading && !pageError && recruitStatus === 'open'
                    ? 'bg-green-400'
                    : 'bg-gray-500'
                }`}
              />
              {headerBadge.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Road Cruise Transport MP 社区团队公开招募，欢迎热爱欧卡与联运的玩家加入。
          </p>
        </header>

        {pageLoading ? (
          <div aria-busy="true" aria-live="polite" className="space-y-4">
            <p className="text-center text-sm text-gray-500">正在加载招募信息...</p>
            <div className="h-28 animate-pulse rounded-xl border border-gray-700/40 bg-[#232428]" />
            <div className="h-40 animate-pulse rounded-xl border border-gray-700/40 bg-[#232428]" />
            <div className="h-24 animate-pulse rounded-xl border border-gray-700/40 bg-[#232428]" />
          </div>
        ) : pageError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-10 text-center shadow-lg"
          >
            <p className="text-sm text-red-300">加载招募信息失败：{pageError}</p>
            <button
              type="button"
              onClick={() => setPageReload((value) => value + 1)}
              className="mt-5 rounded bg-red-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-600"
            >
              重试
            </button>
          </div>
        ) : (
          <>
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

            {!hasOpenPosition && (
              <section className="mt-6 rounded-xl border border-gray-700 bg-[#2c2d31] p-6 text-center shadow-lg">
                <div className="text-3xl" aria-hidden="true">
                  📢
                </div>
                <h2 className="mt-2 text-lg font-bold text-white">
                  {currentSettings.is_open ? '暂无开放职位' : '招募暂未开放'}
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  请关注新闻公告，下一轮招募开放后会第一时间在这里公布。
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/news" className={ctaPrimaryClass}>
                    查看新闻公告
                  </Link>
                  <Link href="/team" className={ctaSecondaryClass}>
                    了解现有团队
                  </Link>
                </div>
              </section>
            )}

            <section className="mt-8">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-white">招募职位</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    共 {positions.length} 个职位
                    {openPositionCount > 0 ? ` · ${openPositionCount} 个开放中` : ''}
                  </p>
                </div>
              </div>

              {positions.length === 0 ? (
                <p className="rounded-xl border border-gray-700 bg-[#232428] px-4 py-10 text-center text-sm text-gray-500">
                  暂无职位信息，请关注新闻公告与下一轮招募。
                </p>
              ) : (
                <ul className="space-y-4">
                  {positions.map((position) => {
                    const available = isOpen && position.is_open;
                    const selected = activePosition?.id === position.id;
                    const questionCount = position.questions.length;
                    const formId = `position-application-${position.id}`;

                    return (
                      <li key={position.id}>
                        <article
                          className={`rounded-xl border p-5 shadow-lg transition ${
                            available
                              ? 'border-gray-700 bg-[#2c2d31]'
                              : 'border-gray-800 bg-[#232428]'
                          } ${selected ? 'ring-2 ring-blue-500/50' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className={`text-base font-bold ${
                                available ? 'text-white' : 'text-gray-400'
                              }`}
                            >
                              {position.name}
                            </h3>
                            {position.department && (
                              <span
                                className={`rounded border px-2 py-0.5 text-xs ${
                                  available
                                    ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                                    : 'border-gray-700 bg-[#2c2d31] text-gray-500'
                                }`}
                              >
                                {position.department}
                              </span>
                            )}
                            <span
                              className={`rounded border px-2 py-0.5 text-xs font-bold ${
                                available
                                  ? 'border-green-500/40 bg-green-500/15 text-green-300'
                                  : 'border-gray-700 bg-[#2c2d31] text-gray-500'
                              }`}
                            >
                              {available ? '开放中' : '暂未开放'}
                            </span>
                          </div>

                          <p
                            className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${
                              available ? 'text-gray-400' : 'text-gray-500'
                            }`}
                          >
                            {position.description.trim() || '职位说明待补充。'}
                          </p>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-700/60 pt-3">
                            <span className="text-xs text-gray-500">
                              {available
                                ? `问题数量：${questionCount}${
                                    questionCount === 0 ? '（无需额外填写）' : ''
                                  }`
                                : '暂未开放，暂不接受申请'}
                            </span>
                            {available ? (
                              <button
                                type="button"
                                onClick={() => togglePosition(position)}
                                aria-expanded={selected}
                                aria-controls={selected ? formId : undefined}
                                className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                              >
                                {selected ? '收起申请' : '申请该职位'}
                              </button>
                            ) : null}
                          </div>
                        </article>

                        {success && success.positionId === position.id && (
                          <p
                            role="status"
                            className="mt-3 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-300"
                          >
                            {success.text}
                          </p>
                        )}

                        {selected && activePosition && (
                          <div
                            id={formId}
                            className="mt-3 rounded-xl border border-blue-500/40 bg-[#232428] p-5 shadow-lg"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/70 pb-3">
                              <h4 className="text-base font-bold text-white">
                                申请「{position.name}」
                              </h4>
                              <button
                                type="button"
                                onClick={closeForm}
                                disabled={submitting}
                                className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
                              >
                                收起
                              </button>
                            </div>

                            {authLoading ? (
                              <p className="py-8 text-center text-sm text-gray-500">
                                正在确认登录状态...
                              </p>
                            ) : !userId ? (
                              <div className="py-8 text-center">
                                <p className="text-sm text-gray-300">请先登录后申请</p>
                                <Link
                                  href="/login"
                                  className="mt-4 inline-block rounded bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                                >
                                  前往登录
                                </Link>
                              </div>
                            ) : (
                              <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5">
                                {activePosition.questions.map((question, index) => {
                                  const fieldId = `question-${activePosition.id}-${index}`;
                                  const value = answers[question.id] ?? '';

                                  return (
                                    <div key={`${question.id}-${index}`}>
                                      <label htmlFor={fieldId} className={labelClass}>
                                        {question.label}
                                        {question.required && (
                                          <>
                                            <span className="ml-1 text-red-400" aria-hidden="true">
                                              *
                                            </span>
                                            <span className="sr-only">（必填）</span>
                                          </>
                                        )}
                                      </label>

                                      {question.type === 'textarea' ? (
                                        <textarea
                                          id={fieldId}
                                          rows={4}
                                          value={value}
                                          required={question.required}
                                          onChange={(event) =>
                                            updateAnswer(question.id, event.target.value)
                                          }
                                          className={`${inputClass} resize-y`}
                                        />
                                      ) : question.type === 'select' &&
                                        question.options.length > 0 ? (
                                        <select
                                          id={fieldId}
                                          value={value}
                                          required={question.required}
                                          onChange={(event) =>
                                            updateAnswer(question.id, event.target.value)
                                          }
                                          className={inputClass}
                                        >
                                          <option value="">请选择</option>
                                          {question.options.map((option, optionIndex) => (
                                            <option
                                              key={`${option}-${optionIndex}`}
                                              value={option}
                                            >
                                              {option}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        // select 未配置 options 时退化为文本输入，避免题目永远无法填写。
                                        <input
                                          id={fieldId}
                                          type="text"
                                          value={value}
                                          required={question.required}
                                          onChange={(event) =>
                                            updateAnswer(question.id, event.target.value)
                                          }
                                          className={inputClass}
                                        />
                                      )}
                                    </div>
                                  );
                                })}

                                {activePosition.questions.length === 0 && (
                                  <p className="text-sm text-gray-500">
                                    该职位没有额外问题，填写联系方式后即可提交。
                                  </p>
                                )}

                                <div>
                                  <label htmlFor="recruitment-contact" className={labelClass}>
                                    联系方式（可选）
                                  </label>
                                  <input
                                    id="recruitment-contact"
                                    type="text"
                                    value={contact}
                                    maxLength={MAX_CONTACT}
                                    placeholder="邮箱 / Discord / QQ 等"
                                    onChange={(event) => {
                                      setContact(event.target.value);
                                      setFormError(null);
                                    }}
                                    className={inputClass}
                                  />
                                  <div className="mt-1 flex justify-end text-xs text-gray-500">
                                    <span
                                      className={
                                        contact.length >= MAX_CONTACT ? 'text-orange-400' : ''
                                      }
                                    >
                                      {contact.length}/{MAX_CONTACT}
                                    </span>
                                  </div>
                                </div>

                                {formError && (
                                  <p
                                    role="alert"
                                    className="whitespace-pre-line rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                                  >
                                    {formError}
                                  </p>
                                )}

                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="submit"
                                    disabled={submitting}
                                    className={primaryButtonClass}
                                  >
                                    {submitting ? '提交中...' : '提交申请'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={closeForm}
                                    disabled={submitting}
                                    className={secondaryButtonClass}
                                  >
                                    取消
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {userId && (
              <section className="mt-10">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold text-white">我的申请</h2>
                    <p className="mt-1 text-xs text-gray-500">仅显示最近 {MAX_APPLICATIONS} 条。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setApplicationsReload((value) => value + 1)}
                    disabled={applicationsLoading}
                    className="text-sm text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
                  >
                    {applicationsLoading ? '刷新中...' : '刷新'}
                  </button>
                </div>

                {applicationsLoading && applications.length === 0 ? (
                  <div aria-busy="true" className="space-y-3">
                    <div className="h-24 animate-pulse rounded-lg border border-gray-700/40 bg-[#232428]" />
                    <div className="h-24 animate-pulse rounded-lg border border-gray-700/40 bg-[#232428]" />
                  </div>
                ) : applicationsError ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="break-all">加载失败：{applicationsError}</span>
                    <button
                      type="button"
                      onClick={() => setApplicationsReload((value) => value + 1)}
                      disabled={applicationsLoading}
                      className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      重试
                    </button>
                  </div>
                ) : applications.length === 0 ? (
                  <p className="rounded border border-gray-700 bg-[#232428] px-4 py-8 text-center text-sm text-gray-500">
                    你还没有提交过申请。
                  </p>
                ) : (
                  <ul
                    aria-busy={applicationsLoading}
                    className={`space-y-4 transition-opacity ${
                      applicationsLoading ? 'opacity-60' : ''
                    }`}
                  >
                      {applications.map((application) => {
                        const meta = STATUS_META[application.status];
                        const answerItems = buildAnswerItems(
                          application.answers,
                          positionById.get(application.position_id ?? -1)
                        );
                        const expanded = expandedApplications[application.id] === true;

                        return (
                          <li
                            key={application.id}
                            className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 text-sm font-bold text-white">
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

                            {application.contact && (
                              <p className="mt-2 break-all text-xs text-gray-500">
                                联系方式：
                                <span className="text-gray-300">{application.contact}</span>
                              </p>
                            )}

                            {application.handle_note && (
                              <p className="mt-3 whitespace-pre-wrap break-words rounded border border-gray-700 bg-[#232428] px-3 py-2 text-xs text-gray-300">
                                处理备注：{application.handle_note}
                              </p>
                            )}

                            {answerItems.length > 0 ? (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => toggleApplication(application.id)}
                                  aria-expanded={expanded}
                                  className="text-xs text-blue-400 transition hover:text-blue-300"
                                >
                                  {expanded
                                    ? '收起填写内容'
                                    : `查看填写内容（${answerItems.length} 项）`}
                                </button>

                                {expanded && (
                                  <dl className="mt-2 space-y-2 border-t border-gray-700/60 pt-3">
                                    {answerItems.map((item, index) => (
                                      <div
                                        key={`${item.id}-${index}`}
                                        className="grid gap-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
                                      >
                                        <dt className="break-words text-xs text-gray-500">
                                          {item.label}
                                        </dt>
                                        <dd className="whitespace-pre-wrap break-words text-sm text-gray-300">
                                          {item.value}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                )}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs italic text-gray-500">
                                未填写额外问题。
                              </p>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
