'use client';
// app/admin/recruitment/page.tsx
// 后台：招募管理（Lv.40+）。
//
// 数据库侧事实（已上线，本页不改 SQL，只按既有 RLS 读写）：
//   · recruitment_settings 单行 id=1：is_open 总开关 / title / intro / requirements /
//     positions（旧文本，本页忽略）/ updated_by / updated_at；匿名可读，Lv.40+ 可 UPDATE。
//   · recruitment_positions：每个职位独立 is_open、部门、说明、questions jsonb、sort_order。
//     questions 是数组：[{ id, label, type: 'text'|'textarea'|'select', required, options? }]。
//     assign_role（通过后授予的正式角色）、is_trainee（是否实习岗位）、trainee_role（实习角色）。
//     匿名可读，Lv.40+ 可 INSERT/UPDATE/DELETE。
//   · recruitment_applications：position_id 关联职位（on delete set null）、answers jsonb、
//     status ∈ pending|reviewing|accepted|rejected；Lv.40+ 可 SELECT 全部、UPDATE。
//     状态变化由数据库触发器自动通知申请人；同一用户同一职位只能有一条待处理申请。
//   · profiles：id / display_name / custom_id / steam_verified（申请人、处理人展示）。
//   · roles：name / display_name / level / department（匿名可读），用于角色下拉与展示映射。
//   · RPC：rct_recruitment_accept(p_application_id, p_note) 通过申请并按职位同步角色；
//     rct_recruitment_promote(p_application_id) 把已通过的实习申请转为正式角色。
//
// 本页做四件事：① 总开关；② 招募文案（title/intro/requirements）；
// ③ 职位与每职位题库管理；④ 按状态/职位筛选的申请审核。
// 申请列表服务端分页（每页 20 条），count 与 range 同源，筛选项下推到 PostgREST；
// 当前页的申请人/处理人再按 user_id 分块二次查询 profiles。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { canAccessAdmin, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 20;
const PROFILE_CHUNK_SIZE = 100;
const ANSWER_PREVIEW_ITEMS = 2;
const ANSWER_PREVIEW_CHARS = 160;
const COPY_TITLE_MAX_LENGTH = 120;
const COPY_TEXT_MAX_LENGTH = 3000;

type RecruitmentStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected';
type StatusFilter = 'all' | RecruitmentStatus;
type DecisionStatus = 'accepted' | 'rejected';
type QuestionType = 'text' | 'textarea' | 'select';
type PositionFilter = 'all' | number;
type PageItem = number | 'ellipsis';

interface RecruitmentSettings {
  is_open: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

/** 招募文案：recruitment_settings 的 title / intro / requirements，公开页直接展示。 */
interface RecruitmentCopy {
  title: string;
  intro: string;
  requirements: string;
}

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  /** 仅 select 类型使用；其他类型写回时省略该字段。 */
  options?: string[];
}

interface PositionRow {
  id: number;
  name: string;
  department: string;
  description: string;
  questions: Question[];
  is_open: boolean;
  sort_order: number;
  assign_role: string | null;
  is_trainee: boolean;
  trainee_role: string | null;
  updated_at: string | null;
}

/** roles 表的公开只读字段：用于职位配置下拉与 display_name 展示映射。 */
interface RoleRow {
  name: string;
  display_name: string;
  level: number | null;
  department: string | null;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  position_id: number | null;
  position: string;
  contact: string | null;
  answers: Record<string, unknown>;
  status: RecruitmentStatus;
  handled_by: string | null;
  handle_note: string | null;
  promoted_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ProfileInfo {
  display_name: string | null;
  custom_id: string | null;
  steam_verified: boolean;
}

interface AnswerEntry {
  key: string;
  label: string | null;
  value: string;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface Decision {
  applicationId: string;
  next: DecisionStatus;
  note: string;
}

interface AddPositionForm {
  name: string;
  department: string;
  description: string;
  sort_order: string;
  is_open: boolean;
}

interface QuestionDraft {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  optionsText: string;
}

interface PositionDraft {
  id: number;
  name: string;
  department: string;
  description: string;
  /** 空串表示不授予角色（保存时写 null）。 */
  assign_role: string;
  is_trainee: boolean;
  /** 空串表示不授予实习角色（非实习或留空时保存为 null）。 */
  trainee_role: string;
  questions: QuestionDraft[];
}

const STATUS_META: Record<RecruitmentStatus, { label: string; className: string }> = {
  pending: {
    label: '待审核',
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
    className: 'border-red-500/40 bg-red-500/15 text-red-300',
  },
};

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'reviewing', label: '审核中' },
  { value: 'accepted', label: '已通过' },
  { value: 'rejected', label: '未通过' },
];

const QUESTION_TYPE_OPTIONS: ReadonlyArray<{ value: QuestionType; label: string }> = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'select', label: '选择题' },
];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: '单行文本',
  textarea: '多行文本',
  select: '选择题',
};

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-60';
const labelClass = 'mb-1 block text-xs text-gray-400';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isRecruitmentStatus(value: unknown): value is RecruitmentStatus {
  return (
    value === 'pending' ||
    value === 'reviewing' ||
    value === 'accepted' ||
    value === 'rejected'
  );
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '操作失败，请稍后重试';
}

function formatTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

/** 生成页码按钮：当前页前后各 2 页 + 首尾页，中间用省略号连接。 */
function buildPageItems(currentPage: number, totalPages: number): PageItem[] {
  const visible = new Set<number>();
  visible.add(1);
  visible.add(totalPages);
  for (let candidate = currentPage - 2; candidate <= currentPage + 2; candidate += 1) {
    if (candidate >= 1 && candidate <= totalPages) visible.add(candidate);
  }

  const sorted = Array.from(visible).sort((left, right) => left - right);
  const items: PageItem[] = [];
  let previous = 0;
  for (const pageNumber of sorted) {
    if (previous !== 0 && pageNumber - previous > 1) items.push('ellipsis');
    items.push(pageNumber);
    previous = pageNumber;
  }
  return items;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function toQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const questions: Question[] = [];

  raw.forEach((item, index) => {
    if (!isRecord(item)) return;
    const label = typeof item.label === 'string' ? item.label : '';
    const type: QuestionType =
      item.type === 'textarea' ? 'textarea' : item.type === 'select' ? 'select' : 'text';

    // 历史数据可能缺少 id 或重复，这里兜底成稳定且唯一的 id。
    let id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id.trim() : `q_${index}`;
    while (seen.has(id)) id = `${id}_${index}`;
    seen.add(id);

    questions.push({
      id,
      label,
      type,
      required: item.required === true,
      options: type === 'select' ? toStringArray(item.options) : [],
    });
  });

  return questions;
}

function toSettings(raw: unknown): RecruitmentSettings | null {
  if (!isRecord(raw)) return null;
  return {
    is_open: raw.is_open === true,
    updated_by: asText(raw.updated_by),
    updated_at: asText(raw.updated_at),
  };
}

function toRecruitmentCopy(raw: unknown): RecruitmentCopy | null {
  if (!isRecord(raw)) return null;
  return {
    title: asText(raw.title) ?? '',
    intro: asText(raw.intro) ?? '',
    requirements: asText(raw.requirements) ?? '',
  };
}

function toPositionRow(raw: unknown): PositionRow | null {
  if (!isRecord(raw)) return null;
  const id = asNumber(raw.id);
  if (id === null) return null;
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : '未命名职位',
    department: typeof raw.department === 'string' ? raw.department : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    questions: toQuestions(raw.questions),
    is_open: raw.is_open === true,
    sort_order: asNumber(raw.sort_order) ?? 0,
    assign_role:
      typeof raw.assign_role === 'string' && raw.assign_role.trim() !== ''
        ? raw.assign_role.trim()
        : null,
    is_trainee: raw.is_trainee === true,
    trainee_role:
      typeof raw.trainee_role === 'string' && raw.trainee_role.trim() !== ''
        ? raw.trainee_role.trim()
        : null,
    updated_at: asText(raw.updated_at),
  };
}

function toPositionRows(data: unknown): PositionRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toPositionRow).filter((row): row is PositionRow => row !== null);
}

function toRoleRows(data: unknown): RoleRow[] {
  if (!Array.isArray(data)) return [];
  const rows: RoleRow[] = [];

  for (const item of data) {
    if (!isRecord(item)) continue;
    const name = asText(item.name);
    if (!name) continue;
    rows.push({
      name,
      display_name:
        typeof item.display_name === 'string' && item.display_name.trim() !== ''
          ? item.display_name.trim()
          : name,
      level: asNumber(item.level),
      department: typeof item.department === 'string' ? item.department : null,
    });
  }

  return rows;
}

/** 下拉选项文案：display_name [Lv.x]（level 缺失时只显示名称）。 */
function formatRoleOption(role: RoleRow): string {
  return role.level === null ? role.display_name : `${role.display_name} [Lv.${role.level}]`;
}

/** RPC 返回 jsonb { ok, role, role_level?, trainee? }，这里只取 role。 */
function rpcRole(data: unknown): string | null {
  if (!isRecord(data)) return null;
  return typeof data.role === 'string' && data.role.trim() !== '' ? data.role : null;
}

function toApplicationRow(raw: unknown): ApplicationRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  const userId = asText(raw.user_id);
  const createdAt = asText(raw.created_at);
  if (!id || !userId || !createdAt) return null;

  return {
    id,
    user_id: userId,
    position_id: asNumber(raw.position_id),
    position: typeof raw.position === 'string' ? raw.position : '',
    contact: typeof raw.contact === 'string' && raw.contact.trim() ? raw.contact : null,
    answers: isRecord(raw.answers) ? raw.answers : {},
    status: isRecruitmentStatus(raw.status) ? raw.status : 'pending',
    handled_by: asText(raw.handled_by),
    handle_note:
      typeof raw.handle_note === 'string' && raw.handle_note.trim() ? raw.handle_note : null,
    promoted_at: asText(raw.promoted_at),
    created_at: createdAt,
    updated_at: asText(raw.updated_at),
  };
}

function toApplicationRows(data: unknown): ApplicationRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toApplicationRow).filter((row): row is ApplicationRow => row !== null);
}

function toProfileMap(data: unknown): Record<string, ProfileInfo> {
  const map: Record<string, ProfileInfo> = {};
  if (!Array.isArray(data)) return map;

  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = asText(item.id);
    if (!id) continue;
    map[id] = {
      display_name: typeof item.display_name === 'string' ? item.display_name : null,
      custom_id: typeof item.custom_id === 'string' ? item.custom_id : null,
      steam_verified: item.steam_verified === true,
    };
  }

  return map;
}

function formatAnswer(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    return value
      .map((item) => formatAnswer(item))
      .filter((text) => text !== '')
      .join('、');
  }
  if (isRecord(value)) return JSON.stringify(value) ?? '';
  return '';
}

function previewAnswer(value: string): string {
  return value.length > ANSWER_PREVIEW_CHARS ? `${value.slice(0, ANSWER_PREVIEW_CHARS)}…` : value;
}

/**
 * 把 answers jsonb 变成「问题：回答」列表。
 * 职位仍存在时按 questions 的 id 映射 label；职位已删除（position_id 为 null）
 * 或 answers 里存在题库之外的历史 key 时，保留原始 key 展示。
 */
function buildAnswerEntries(application: ApplicationRow, position: PositionRow | null): AnswerEntry[] {
  const entries: AnswerEntry[] = [];
  const used = new Set<string>();

  if (position) {
    for (const question of position.questions) {
      const value = formatAnswer(application.answers[question.id]);
      if (!value) continue;
      used.add(question.id);
      entries.push({ key: question.id, label: question.label, value });
    }
  }

  for (const [key, raw] of Object.entries(application.answers)) {
    if (used.has(key)) continue;
    const value = formatAnswer(raw);
    if (!value) continue;
    entries.push({ key, label: null, value });
  }

  return entries;
}

function toQuestionDrafts(questions: Question[]): QuestionDraft[] {
  return questions.map((question) => ({
    id: question.id,
    label: question.label,
    type: question.type,
    required: question.required,
    optionsText: (question.options ?? []).join('\n'),
  }));
}

/** 把编辑器草稿规整成 questions jsonb：数组、id 唯一、label 非空、选择题至少有 1 个选项。 */
function normalizeQuestionDrafts(drafts: QuestionDraft[]): {
  questions: Question[];
  error: string | null;
} {
  const seen = new Set<string>();
  const questions: Question[] = [];

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const label = draft.label.trim();
    if (!label) {
      return { questions: [], error: `第 ${index + 1} 个问题缺少题目文案。` };
    }

    let id = draft.id.trim() !== '' ? draft.id.trim() : `q_${index}`;
    while (seen.has(id)) id = `${id}_${index}`;

    const options = draft.type === 'select' ? toStringArray(draft.optionsText.split('\n')) : [];
    if (draft.type === 'select' && options.length === 0) {
      return { questions: [], error: `「${label}」是选择题，至少需要一个选项。` };
    }

    seen.add(id);
    const question: Question = { id, label, type: draft.type, required: draft.required };
    if (draft.type === 'select') question.options = options;
    questions.push(question);
  }

  return { questions, error: null };
}

function createQuestionId(used: Set<string>): string {
  let id = `q_${Math.random().toString(36).slice(2, 10)}`;
  while (used.has(id)) id = `q_${Math.random().toString(36).slice(2, 10)}`;
  return id;
}

function NoticeLine({ notice, className = '' }: { notice: Notice | null; className?: string }) {
  if (!notice) return null;
  return (
    <p
      aria-live="polite"
      className={`mt-3 rounded border px-4 py-2.5 text-sm ${
        notice.kind === 'success'
          ? 'border-green-500/40 bg-green-500/10 text-green-300'
          : 'border-red-500/40 bg-red-500/10 text-red-300'
      } ${className}`}
    >
      {notice.text}
    </p>
  );
}

function ErrorBox({
  prefix,
  message,
  onRetry,
  busy,
}: {
  prefix: string;
  message: string;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div
      role="alert"
      className="mt-3 flex flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="break-all">
        {prefix}
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
      >
        重试
      </button>
    </div>
  );
}

export default function AdminRecruitmentPage() {
  const router = useRouter();
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // —— 总开关 ——
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [settingsUpdatedBy, setSettingsUpdatedBy] = useState<string | null>(null);
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<Notice | null>(null);

  // —— 招募文案 ——
  const [copyForm, setCopyForm] = useState<RecruitmentCopy>({
    title: '',
    intro: '',
    requirements: '',
  });
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyNotice, setCopyNotice] = useState<Notice | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  // 用户改动过文案后置 true：设置重新加载时不覆盖正在编辑的内容。
  const copyDirtyRef = useRef(false);

  // —— 职位管理 ——
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [positionsNotice, setPositionsNotice] = useState<Notice | null>(null);
  const [positionsReloadToken, setPositionsReloadToken] = useState(0);
  const [positionBusyId, setPositionBusyId] = useState<number | null>(null);

  // —— 角色字典：roles 匿名可读，登录后一次性加载，供职位配置与展示映射使用 ——
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // 新增职位
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddPositionForm>({
    name: '',
    department: '',
    description: '',
    sort_order: '10',
    is_open: false,
  });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // 编辑职位（含问题编辑器）
  const [editing, setEditing] = useState<PositionDraft | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // —— 申请列表 ——
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsReloadToken, setApplicationsReloadToken] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [page, setPage] = useState(1);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});
  const [busyApplicationId, setBusyApplicationId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [listNotice, setListNotice] = useState<Notice | null>(null);

  const fetchProfiles = useCallback(async (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id !== '')));
    if (unique.length === 0) return;

    const merged: Record<string, ProfileInfo> = {};
    // 分块查询，避免把多行 UUID 的 PostgREST URL 拉得过长。
    for (let index = 0; index < unique.length; index += PROFILE_CHUNK_SIZE) {
      const chunk = unique.slice(index, index + PROFILE_CHUNK_SIZE);
      const { data, error } = await supabase
        .from('profiles')
        .select('id,display_name,custom_id,steam_verified')
        .in('id', chunk);

      if (error) {
        // 资料查询失败不阻塞管理操作，只是显示为“未知用户”。
        console.error('加载用户资料失败:', error.message);
        continue;
      }

      Object.assign(merged, toProfileMap(data));
    }

    if (Object.keys(merged).length === 0) return;
    setProfiles((previous) => ({ ...previous, ...merged }));
  }, []);

  // 1. 权限：未登录 -> /login；非 Lv.40+ -> alert + /admin
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          router.push('/login');
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role_level')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;

        if (error) {
          alert(`无法验证权限：${error.message}`);
          router.push('/admin');
          return;
        }

        if (!canAccessAdmin(levelOf(profile?.role_level))) {
          alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能管理招募。');
          router.push('/admin');
          return;
        }

        setUserId(user.id);
        setChecking(false);
      } catch (error) {
        if (cancelled) return;
        alert(`无法验证权限：${errorMessage(error)}`);
        router.push('/admin');
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // 2. 总开关：读取单行 id=1（匿名可读）
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      setSettingsReady(false);

      try {
        const { data, error } = await supabase
          .from('recruitment_settings')
          .select('id,is_open,title,intro,requirements,updated_by,updated_at')
          .eq('id', 1)
          .maybeSingle();
        if (cancelled) return;

        if (error) {
          setSettingsError(error.message);
          return;
        }

        const parsed = toSettings(data);
        if (!parsed) {
          setSettingsError('未找到招募设置（id=1），请检查数据库初始化。');
          return;
        }

        setIsOpen(parsed.is_open);
        setSettingsUpdatedBy(parsed.updated_by);
        setSettingsUpdatedAt(parsed.updated_at);

        // 首次加载/重新加载时回填文案；用户正在编辑（dirty）时保留其输入。
        const copy = toRecruitmentCopy(data);
        if (copy && !copyDirtyRef.current) setCopyForm(copy);

        setSettingsReady(true);

        if (parsed.updated_by) void fetchProfiles([parsed.updated_by]);
      } catch (error) {
        if (!cancelled) setSettingsError(errorMessage(error));
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, settingsReloadToken, fetchProfiles]);

  // 3. 职位列表：按 sort_order asc（同序时按 id），供管理与 answers 文案映射使用。
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const loadPositions = async () => {
      setPositionsLoading(true);
      setPositionsError(null);

      try {
        const { data, error } = await supabase
          .from('recruitment_positions')
          .select(
            'id,name,department,description,questions,is_open,sort_order,assign_role,is_trainee,trainee_role,updated_at'
          )
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true });
        if (cancelled) return;

        if (error) {
          setPositionsError(error.message);
          return;
        }

        setPositions(toPositionRows(data));
      } catch (error) {
        if (!cancelled) setPositionsError(errorMessage(error));
      } finally {
        if (!cancelled) setPositionsLoading(false);
      }
    };

    void loadPositions();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, positionsReloadToken]);

  // 3.5 角色字典：roles 匿名可读，登录后一次性加载，供职位配置下拉与 display_name 映射。
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const loadRoles = async () => {
      setRolesLoading(true);

      try {
        const { data, error } = await supabase
          .from('roles')
          .select('name,display_name,level,department')
          .order('level', { ascending: false })
          .order('name', { ascending: true });
        if (cancelled) return;

        if (error) {
          console.error('加载角色列表失败:', error.message);
          return;
        }

        setRoles(toRoleRows(data));
      } catch (error) {
        if (!cancelled) console.error('加载角色列表失败:', errorMessage(error));
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    };

    void loadRoles();

    return () => {
      cancelled = true;
    };
  }, [checking, userId]);

  // 4. 申请列表：服务端分页，只取当前页（筛选条件同时作用于 count 与 range）；
  //    再按当前页的 user_id / handled_by 分块二次查询 profiles。
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const loadApplications = async () => {
      setApplicationsLoading(true);
      setApplicationsError(null);

      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from('recruitment_applications')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (positionFilter !== 'all') query = query.eq('position_id', positionFilter);

        const { data, count, error } = await query;
        if (cancelled) return;

        if (error) {
          // 出错时保留现有列表，只提示错误并提供重试。
          setApplicationsError(error.message);
          return;
        }

        const rows = toApplicationRows(data);
        // count 由 Content-Range 解析而来；缺失时至少保证当前页可用，避免误判为 0 条。
        const nextTotal =
          typeof count === 'number' ? count : (page - 1) * PAGE_SIZE + rows.length;
        const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        setTotalCount(nextTotal);

        // 越界保护：处理完最后一页最后一条后总页数变小，回退到最后一页重新请求。
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setApplications(rows);

        const profileIds: string[] = [userId];
        for (const row of rows) {
          profileIds.push(row.user_id);
          if (row.handled_by) profileIds.push(row.handled_by);
        }
        await fetchProfiles(profileIds);
      } catch (error) {
        if (!cancelled) setApplicationsError(errorMessage(error));
      } finally {
        if (!cancelled) setApplicationsLoading(false);
      }
    };

    void loadApplications();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, statusFilter, positionFilter, page, applicationsReloadToken, fetchProfiles]);

  const sortedPositions = useMemo(
    () => [...positions].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [positions]
  );

  const positionById = useMemo(() => {
    const map = new Map<number, PositionRow>();
    for (const position of sortedPositions) map.set(position.id, position);
    return map;
  }, [sortedPositions]);

  const roleByName = useMemo(() => {
    const map = new Map<string, RoleRow>();
    for (const role of roles) map.set(role.name, role);
    return map;
  }, [roles]);

  // 实习角色：name 含 _trainee 或 display_name 含「实习」。
  const traineeRoles = useMemo(
    () =>
      roles.filter(
        (role) => role.name.includes('_trainee') || role.display_name.includes('实习')
      ),
    [roles]
  );

  /** 角色展示文案：优先 roles.display_name，查不到时回退原始 name。 */
  const roleLabel = (name: string | null): string => {
    if (!name) return '未配置角色';
    return roleByName.get(name)?.display_name ?? name;
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);
  const hasFilter = statusFilter !== 'all' || positionFilter !== 'all';

  const reloadPositions = () => setPositionsReloadToken((value) => value + 1);
  const reloadApplications = () => setApplicationsReloadToken((value) => value + 1);

  const goToPage = (target: number) => {
    if (applicationsLoading) return;
    const next = Math.min(Math.max(1, Math.trunc(target)), totalPages);
    if (next === page) return;
    setDecision(null);
    setPage(next);
    setListNotice(null);
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const displayName = (id: string | null): string => {
    if (!id) return '——';
    const profile = profiles[id];
    if (!profile) return '未知用户';
    return profile.display_name?.trim() || '未命名用户';
  };

  // 5. 总开关：乐观更新，失败回滚；写入 updated_by。
  const toggleRecruitment = async () => {
    if (!userId || toggleBusy || settingsLoading || !settingsReady) return;

    const previous = isOpen;
    const next = !previous;

    setToggleBusy(true);
    setSettingsNotice(null);
    setIsOpen(next);

    try {
      const { data, error } = await supabase
        .from('recruitment_settings')
        .update({ is_open: next, updated_by: userId })
        .eq('id', 1)
        .select('id,is_open,updated_by,updated_at')
        .maybeSingle();

      if (error) {
        setIsOpen(previous);
        setSettingsNotice({ kind: 'error', text: `保存失败：${error.message}` });
        return;
      }

      const saved = toSettings(data);
      if (!saved) {
        setIsOpen(previous);
        setSettingsNotice({
          kind: 'error',
          text: '保存失败：没有找到招募设置行（id=1），或当前账号无权修改。',
        });
        return;
      }

      setIsOpen(saved.is_open);
      setSettingsUpdatedBy(saved.updated_by);
      setSettingsUpdatedAt(saved.updated_at);
      if (saved.updated_by) void fetchProfiles([saved.updated_by]);

      setSettingsNotice({
        kind: 'success',
        text: next
          ? '✅ 已开启招募总开关，公开页现在可以提交申请（还需对应职位已开启）。'
          : '⏸️ 已关闭招募总开关，所有职位都不可申请。',
      });
    } catch (error) {
      setIsOpen(previous);
      setSettingsNotice({ kind: 'error', text: `保存失败：${errorMessage(error)}` });
    } finally {
      setToggleBusy(false);
    }
  };

  // 6. 招募文案：title/intro/requirements 一起回写，成功后回填表单并刷新设置。
  const updateCopy = (patch: Partial<RecruitmentCopy>) => {
    copyDirtyRef.current = true;
    setCopyNotice(null);
    setCopyError(null);
    setCopyForm((current) => ({ ...current, ...patch }));
  };

  const saveCopy = async () => {
    if (!userId || copyBusy || settingsLoading || !settingsReady) return;

    const title = copyForm.title.trim();
    const intro = copyForm.intro.trim();
    const requirements = copyForm.requirements.trim();

    setCopyError(null);

    if (!title) {
      setCopyError('标题不能为空。');
      return;
    }
    if (title.length > COPY_TITLE_MAX_LENGTH) {
      setCopyError(`标题不能超过 ${COPY_TITLE_MAX_LENGTH} 个字符。`);
      return;
    }
    if (intro.length > COPY_TEXT_MAX_LENGTH) {
      setCopyError(`招募介绍不能超过 ${COPY_TEXT_MAX_LENGTH} 个字符。`);
      return;
    }
    if (requirements.length > COPY_TEXT_MAX_LENGTH) {
      setCopyError(`任职要求不能超过 ${COPY_TEXT_MAX_LENGTH} 个字符。`);
      return;
    }

    setCopyBusy(true);
    setCopyNotice(null);

    try {
      const { data, error } = await supabase
        .from('recruitment_settings')
        .update({ title, intro, requirements, updated_by: userId })
        .eq('id', 1)
        .select('id,updated_at')
        .maybeSingle();

      if (error) {
        setCopyNotice({ kind: 'error', text: `保存失败：${error.message}` });
        return;
      }

      // update 被 RLS 过滤时不会报错，只会返回 0 行，这里按失败处理。
      if (!data) {
        setCopyNotice({
          kind: 'error',
          text: '保存失败：没有找到招募设置行（id=1），或当前账号无权修改。',
        });
        return;
      }

      const savedUpdatedAt = isRecord(data) ? asText(data.updated_at) : null;
      if (savedUpdatedAt) setSettingsUpdatedAt(savedUpdatedAt);

      copyDirtyRef.current = false;
      setCopyForm({ title, intro, requirements });
      setSettingsUpdatedBy(userId);
      setCopyNotice({
        kind: 'success',
        text: '✅ 招募文案已保存，公开页会展示最新的标题、介绍与任职要求。',
      });
      // 重新拉取 settings，让表单与“最后更新”都以服务端为准。
      setSettingsReloadToken((value) => value + 1);
    } catch (error) {
      setCopyNotice({ kind: 'error', text: `保存失败：${errorMessage(error)}` });
    } finally {
      setCopyBusy(false);
    }
  };

  // 7. 职位开关：逐职位即时保存，失败回滚。
  const togglePosition = async (position: PositionRow) => {
    if (!userId || positionBusyId !== null) return;

    const previous = position.is_open;
    const next = !previous;

    setPositionBusyId(position.id);
    setPositionsNotice(null);
    setPositions((current) =>
      current.map((item) => (item.id === position.id ? { ...item, is_open: next } : item))
    );

    const rollback = () => {
      setPositions((current) =>
        current.map((item) =>
          item.id === position.id ? { ...item, is_open: previous } : item
        )
      );
    };

    try {
      const { data, error } = await supabase
        .from('recruitment_positions')
        .update({ is_open: next })
        .eq('id', position.id)
        .select('id,is_open')
        .maybeSingle();

      if (error) {
        rollback();
        setPositionsNotice({ kind: 'error', text: `保存失败：${error.message}` });
        return;
      }

      if (!data) {
        rollback();
        setPositionsNotice({
          kind: 'error',
          text: '保存失败：没有找到该职位，或当前账号无权修改。',
        });
        return;
      }

      setPositionsNotice({
        kind: 'success',
        text: `「${position.name}」已${next ? '开启' : '关闭'}申请。`,
      });
    } catch (error) {
      rollback();
      setPositionsNotice({ kind: 'error', text: `保存失败：${errorMessage(error)}` });
    } finally {
      setPositionBusyId(null);
    }
  };

  // 8. 上移/下移：交换相邻两项的相对顺序，按 (index+1)*10 重写有变化的 sort_order。
  const movePosition = async (position: PositionRow, direction: -1 | 1) => {
    if (!userId || positionBusyId !== null) return;

    const index = sortedPositions.findIndex((item) => item.id === position.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sortedPositions.length) return;

    const reordered = [...sortedPositions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    const changes = reordered
      .map((item, positionIndex) => ({ id: item.id, next: (positionIndex + 1) * 10, current: item.sort_order }))
      .filter((item) => item.next !== item.current);

    if (changes.length === 0) return;

    setPositionBusyId(position.id);
    setPositionsError(null);
    setPositionsNotice(null);

    // 先乐观更新本地顺序，失败或完成后都由服务端数据覆盖。
    setPositions((current) =>
      current.map((item) => {
        const change = changes.find((entry) => entry.id === item.id);
        return change ? { ...item, sort_order: change.next } : item;
      })
    );

    try {
      for (const change of changes) {
        const { error } = await supabase
          .from('recruitment_positions')
          .update({ sort_order: change.next })
          .eq('id', change.id)
          .select('id')
          .maybeSingle();

        if (error) {
          setPositionsError(`调整排序失败：${error.message}`);
          return;
        }
      }

      setPositionsNotice({
        kind: 'success',
        text: `已${direction === -1 ? '上移' : '下移'}「${position.name}」。`,
      });
    } catch (error) {
      setPositionsError(`调整排序失败：${errorMessage(error)}`);
    } finally {
      setPositionBusyId(null);
      reloadPositions();
    }
  };

  const openAddForm = () => {
    const maxSortOrder = sortedPositions.reduce(
      (maximum, position) => Math.max(maximum, position.sort_order),
      0
    );
    setAddOpen((open) => !open);
    setAddForm({
      name: '',
      department: '',
      description: '',
      sort_order: String(maxSortOrder + 10),
      is_open: false,
    });
    setAddError(null);
    setEditing(null);
    setEditorError(null);
  };

  // 9. 新增职位：is_open 默认 false，sort_order 默认最大值 +10。
  const submitAdd = async () => {
    if (!userId || addBusy) return;

    const name = addForm.name.trim();
    if (!name) {
      setAddError('职位名称不能为空。');
      return;
    }

    const sortOrder = Number.parseInt(addForm.sort_order.trim(), 10);
    if (Number.isNaN(sortOrder)) {
      setAddError('排序号必须是整数。');
      return;
    }

    setAddBusy(true);
    setAddError(null);

    try {
      const { data, error } = await supabase
        .from('recruitment_positions')
        .insert({
          name,
          department: addForm.department.trim(),
          description: addForm.description.trim(),
          sort_order: sortOrder,
          is_open: addForm.is_open,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        setAddError(`新增失败：${error.message}`);
        return;
      }

      if (!data) {
        setAddError('新增失败：当前账号无权新增职位。');
        return;
      }

      setAddOpen(false);
      setPositionsNotice({
        kind: 'success',
        text: `已新增职位「${name}」${addForm.is_open ? '（申请已开启）' : '（申请默认关闭）'}，可在“编辑”里配置专属问题。`,
      });
      reloadPositions();
    } catch (error) {
      setAddError(`新增失败：${errorMessage(error)}`);
    } finally {
      setAddBusy(false);
    }
  };

  const openEditor = (position: PositionRow) => {
    setAddOpen(false);
    setAddError(null);
    setEditing({
      id: position.id,
      name: position.name,
      department: position.department,
      description: position.description,
      assign_role: position.assign_role ?? '',
      is_trainee: position.is_trainee,
      trainee_role: position.trainee_role ?? '',
      questions: toQuestionDrafts(position.questions),
    });
    setEditorError(null);
    setPositionsNotice(null);
  };

  const cancelEditor = () => {
    setEditing(null);
    setEditorError(null);
  };

  const updateEditor = (patch: Partial<Omit<PositionDraft, 'id' | 'questions'>>) => {
    setEditing((current) => (current ? { ...current, ...patch } : current));
  };

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    setEditing((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: current.questions.map((question, questionIndex) =>
          questionIndex === index ? { ...question, ...patch } : question
        ),
      };
    });
  };

  const addQuestion = () => {
    setEditing((current) => {
      if (!current) return current;
      const used = new Set(current.questions.map((question) => question.id));
      return {
        ...current,
        questions: [
          ...current.questions,
          {
            id: createQuestionId(used),
            label: '',
            type: 'text',
            required: false,
            optionsText: '',
          },
        ],
      };
    });
  };

  const removeQuestion = (index: number) => {
    setEditing((current) =>
      current
        ? { ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }
        : current
    );
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setEditing((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.questions.length) return current;
      const next = [...current.questions];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, questions: next };
    });
  };

  // 10. 保存职位：name/department/description 与 questions jsonb 一起回写，成功后刷新。
  const saveEditor = async () => {
    if (!userId || !editing || editorBusy) return;

    const name = editing.name.trim();
    if (!name) {
      setEditorError('职位名称不能为空。');
      return;
    }

    const normalized = normalizeQuestionDrafts(editing.questions);
    if (normalized.error) {
      setEditorError(normalized.error);
      return;
    }

    setEditorBusy(true);
    setEditorError(null);

    try {
      const { data, error } = await supabase
        .from('recruitment_positions')
        .update({
          name,
          department: editing.department.trim(),
          description: editing.description.trim(),
          questions: normalized.questions,
          assign_role: editing.assign_role.trim() === '' ? null : editing.assign_role.trim(),
          is_trainee: editing.is_trainee,
          trainee_role:
            editing.is_trainee && editing.trainee_role.trim() !== ''
              ? editing.trainee_role.trim()
              : null,
        })
        .eq('id', editing.id)
        .select('id')
        .maybeSingle();

      if (error) {
        setEditorError(`保存失败：${error.message}`);
        return;
      }

      if (!data) {
        setEditorError('保存失败：没有找到该职位，或当前账号无权修改。');
        return;
      }

      setEditing(null);
      setPositionsNotice({
        kind: 'success',
        text: `职位「${name}」已保存，共 ${normalized.questions.length} 个专属问题。`,
      });
      reloadPositions();
    } catch (error) {
      setEditorError(`保存失败：${errorMessage(error)}`);
    } finally {
      setEditorBusy(false);
    }
  };

  // 11. 删除职位：on delete set null，历史申请会保留，这里明确提示。
  const deletePosition = async (position: PositionRow) => {
    if (!userId || positionBusyId !== null) return;

    const confirmed = window.confirm(
      `确定删除职位「${position.name}」吗？\n\n该职位的问题配置会一并删除；历史申请记录会保留（职位关联置空），但之后只能看到原始字段名。`
    );
    if (!confirmed) return;

    setPositionBusyId(position.id);
    setPositionsError(null);
    setPositionsNotice(null);

    try {
      const { data, error } = await supabase
        .from('recruitment_positions')
        .delete()
        .eq('id', position.id)
        .select('id')
        .maybeSingle();

      if (error) {
        setPositionsNotice({ kind: 'error', text: `删除失败：${error.message}` });
        return;
      }

      if (!data) {
        setPositionsNotice({
          kind: 'error',
          text: '删除失败：没有找到该职位，或当前账号无权删除。',
        });
        return;
      }

      if (editing?.id === position.id) setEditing(null);
      if (positionFilter === position.id) {
        setPositionFilter('all');
        setPage(1);
        setDecision(null);
      }

      setPositionsNotice({
        kind: 'success',
        text: `已删除职位「${position.name}」，历史申请记录已保留。`,
      });
      reloadPositions();
      reloadApplications();
    } catch (error) {
      setPositionsNotice({ kind: 'error', text: `删除失败：${errorMessage(error)}` });
    } finally {
      setPositionBusyId(null);
    }
  };

  // 12. 审核：更新 { status, handled_by, handle_note } 后刷新当前页。
  //     通过/拒绝可带备注（空存 null）；开始审核不改备注。
  const applyUpdate = async (
    application: ApplicationRow,
    next: RecruitmentStatus,
    note = ''
  ) => {
    if (!userId || busyApplicationId !== null) return;

    setBusyApplicationId(application.id);
    setListNotice(null);

    try {
      const trimmedNote = note.trim();
      const payload: {
        status: RecruitmentStatus;
        handled_by: string;
        handle_note?: string | null;
      } = { status: next, handled_by: userId };

      if (next === 'accepted' || next === 'rejected') {
        payload.handle_note = trimmedNote === '' ? null : trimmedNote;
      }

      const { data, error } = await supabase
        .from('recruitment_applications')
        .update(payload)
        .eq('id', application.id)
        .select('id')
        .maybeSingle();

      if (error) {
        setListNotice({ kind: 'error', text: `更新失败：${error.message}` });
        return;
      }

      if (!data) {
        setListNotice({
          kind: 'error',
          text: '更新失败：没有找到该申请，或当前账号无权处理。',
        });
        return;
      }

      setDecision(null);
      setListNotice({
        kind: 'success',
        text: `申请 #${application.id} 已更新为「${STATUS_META[next].label}」，系统会自动通知申请人。`,
      });
      reloadApplications();
    } catch (error) {
      setListNotice({ kind: 'error', text: `更新失败：${errorMessage(error)}` });
    } finally {
      setBusyApplicationId(null);
    }
  };

  // 12.1 通过申请：调用 RPC 按职位同步正式角色或实习角色，成功后刷新当前页。
  const acceptApplication = async (application: ApplicationRow, note: string) => {
    if (!userId || busyApplicationId !== null) return;

    setBusyApplicationId(application.id);
    setListNotice(null);

    try {
      const trimmedNote = note.trim();
      const { data, error } = await supabase.rpc('rct_recruitment_accept', {
        p_application_id: application.id,
        p_note: trimmedNote === '' ? null : trimmedNote,
      });

      if (error) {
        setListNotice({ kind: 'error', text: `通过失败：${error.message}` });
        return;
      }

      const role = rpcRole(data);
      setDecision(null);
      setListNotice({
        kind: 'success',
        text: `已通过并同步职位：${role ?? '未配置角色'}`,
      });
      reloadApplications();
    } catch (error) {
      setListNotice({ kind: 'error', text: `通过失败：${errorMessage(error)}` });
    } finally {
      setBusyApplicationId(null);
    }
  };

  // 12.2 实习转正：已通过的实习申请改为授予职位配置的正式角色。
  const promoteApplication = async (application: ApplicationRow) => {
    if (!userId || busyApplicationId !== null) return;

    setBusyApplicationId(application.id);
    setListNotice(null);

    try {
      const { data, error } = await supabase.rpc('rct_recruitment_promote', {
        p_application_id: application.id,
      });

      if (error) {
        setListNotice({ kind: 'error', text: `转正失败：${error.message}` });
        return;
      }

      const role = rpcRole(data);
      setListNotice({ kind: 'success', text: `已转正为 ${role ?? '未知角色'}` });
      reloadApplications();
    } catch (error) {
      setListNotice({ kind: 'error', text: `转正失败：${errorMessage(error)}` });
    } finally {
      setBusyApplicationId(null);
    }
  };

  const submitDecision = async (application: ApplicationRow) => {
    if (!decision || decision.applicationId !== application.id) return;
    if (decision.next === 'accepted') {
      await acceptApplication(application, decision.note);
      return;
    }
    await applyUpdate(application, decision.next, decision.note);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        验证权限中...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">📢 招募管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              管理招募文案、总开关、各职位独立开关与专属问题，并按状态/职位筛选审核申请；状态变更后系统会自动通知申请人。
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/recruitment" className="text-blue-400 transition hover:text-white">
              查看招募页 →
            </Link>
            <Link href="/admin" className="text-gray-400 transition hover:text-white">
              ← 返回控制台
            </Link>
          </div>
        </header>

        {/* ================= 总开关 ================= */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">🔌 总开关</h2>
              <p className="mt-1 max-w-2xl text-xs text-gray-500">
                关闭后所有职位都不可申请（即使单个职位仍处于开启状态）；已提交的申请仍可继续审核。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                当前：
                {settingsLoading ? (
                  <span className="font-bold text-gray-300">加载中...</span>
                ) : (
                  <span className={isOpen ? 'font-bold text-green-400' : 'font-bold text-gray-300'}>
                    {isOpen ? '已开启' : '已关闭'}
                  </span>
                )}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isOpen}
                aria-label="招募总开关"
                onClick={() => void toggleRecruitment()}
                disabled={toggleBusy || settingsLoading || !settingsReady}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isOpen ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    isOpen ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              {toggleBusy && <span className="text-xs text-gray-400">保存中...</span>}
            </div>
          </div>

          {settingsError && (
            <ErrorBox
              prefix="加载失败："
              message={settingsError}
              onRetry={() => setSettingsReloadToken((value) => value + 1)}
              busy={settingsLoading}
            />
          )}

          <NoticeLine notice={settingsNotice} />

          <p className="mt-3 text-xs text-gray-500">
            最后更新：{formatTime(settingsUpdatedAt)} · 更新人：{displayName(settingsUpdatedBy)}
          </p>
        </section>

        {/* ================= 招募文案 ================= */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <div className="border-b border-gray-700/70 pb-3">
            <h2 className="text-lg font-bold text-white">📝 招募文案</h2>
            <p className="mt-1 max-w-3xl text-xs text-gray-500">
              公开页会展示这里的标题、招募介绍与任职要求；保存后立即生效，可随时修改。
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <label htmlFor="recruitment-copy-title" className={labelClass}>
                标题 *
              </label>
              <input
                id="recruitment-copy-title"
                type="text"
                value={copyForm.title}
                onChange={(event) => updateCopy({ title: event.target.value })}
                maxLength={COPY_TITLE_MAX_LENGTH}
                placeholder="例如：加入 RCT MP 团队"
                disabled={copyBusy || !settingsReady}
                className={inputClass}
              />
              <p className="mt-1 text-right text-xs text-gray-600">
                {copyForm.title.length} / {COPY_TITLE_MAX_LENGTH}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="recruitment-copy-intro" className={labelClass}>
                  招募介绍
                </label>
                <textarea
                  id="recruitment-copy-intro"
                  value={copyForm.intro}
                  onChange={(event) => updateCopy({ intro: event.target.value })}
                  rows={6}
                  maxLength={COPY_TEXT_MAX_LENGTH}
                  placeholder="介绍服务器、团队氛围与招募背景；支持换行。"
                  disabled={copyBusy || !settingsReady}
                  className={`${inputClass} resize-y`}
                />
                <p className="mt-1 text-right text-xs text-gray-600">
                  {copyForm.intro.length} / {COPY_TEXT_MAX_LENGTH}
                </p>
              </div>

              <div>
                <label htmlFor="recruitment-copy-requirements" className={labelClass}>
                  任职要求
                </label>
                <textarea
                  id="recruitment-copy-requirements"
                  value={copyForm.requirements}
                  onChange={(event) => updateCopy({ requirements: event.target.value })}
                  rows={6}
                  maxLength={COPY_TEXT_MAX_LENGTH}
                  placeholder="列出申请人需要满足的条件；支持换行。"
                  disabled={copyBusy || !settingsReady}
                  className={`${inputClass} resize-y`}
                />
                <p className="mt-1 text-right text-xs text-gray-600">
                  {copyForm.requirements.length} / {COPY_TEXT_MAX_LENGTH}
                </p>
              </div>
            </div>
          </div>

          {copyError && (
            <p role="alert" className="mt-3 break-all text-sm text-red-300">
              {copyError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveCopy()}
              disabled={copyBusy || settingsLoading || !settingsReady}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copyBusy ? '保存中...' : '保存文案'}
            </button>
            <span className="text-xs text-gray-500">
              介绍与任职要求支持多行，换行会原样展示在公开页。
            </span>
          </div>

          <NoticeLine notice={copyNotice} />
        </section>

        {/* ================= 职位管理 ================= */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700/70 pb-3">
            <div>
              <h2 className="text-lg font-bold text-white">🧩 职位管理</h2>
              <p className="mt-1 text-xs text-gray-500">
                每个职位可独立开关、独立题库。关闭的职位在公开页不可申请；删除职位不会删除历史申请。
              </p>
            </div>
            <button
              type="button"
              onClick={openAddForm}
              disabled={positionsLoading || positionBusyId !== null}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addOpen ? '收起新增表单' : '➕ 新增职位'}
            </button>
          </div>

          {positionsError && (
            <ErrorBox
              prefix="职位加载失败："
              message={positionsError}
              onRetry={reloadPositions}
              busy={positionsLoading}
            />
          )}

          <NoticeLine notice={positionsNotice} />

          {addOpen && (
            <div className="mt-4 rounded border border-blue-500/40 bg-[#232428] p-4">
              <h3 className="text-sm font-bold text-white">新增职位</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="new-position-name" className={labelClass}>
                    职位名称 *
                  </label>
                  <input
                    id="new-position-name"
                    type="text"
                    value={addForm.name}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, name: event.target.value }))
                    }
                    maxLength={80}
                    placeholder="例如：社区版主"
                    disabled={addBusy}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="new-position-department" className={labelClass}>
                    部门
                  </label>
                  <input
                    id="new-position-department"
                    type="text"
                    value={addForm.department}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, department: event.target.value }))
                    }
                    maxLength={80}
                    placeholder="例如：社区线"
                    disabled={addBusy}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="new-position-description" className={labelClass}>
                    职位说明
                  </label>
                  <textarea
                    id="new-position-description"
                    value={addForm.description}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={3}
                    maxLength={1000}
                    placeholder="向申请人说明这个职位负责什么。"
                    disabled={addBusy}
                    className={`${inputClass} resize-y`}
                  />
                </div>
                <div>
                  <label htmlFor="new-position-sort" className={labelClass}>
                    排序号（越小越靠前）
                  </label>
                  <input
                    id="new-position-sort"
                    type="number"
                    step={10}
                    value={addForm.sort_order}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, sort_order: event.target.value }))
                    }
                    disabled={addBusy}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 pb-2.5 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={addForm.is_open}
                      onChange={(event) =>
                        setAddForm((current) => ({ ...current, is_open: event.target.checked }))
                      }
                      disabled={addBusy}
                      className="h-4 w-4"
                    />
                    创建后立即开启申请
                  </label>
                </div>
              </div>

              {addError && (
                <p role="alert" className="mt-3 break-all text-sm text-red-300">
                  {addError}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitAdd()}
                  disabled={addBusy}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addBusy ? '保存中...' : '保存职位'}
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  disabled={addBusy}
                  className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-50"
                >
                  取消
                </button>
                <span className="text-xs text-gray-500">问题可在创建后用「编辑」添加。</span>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {positionsLoading && sortedPositions.length === 0 ? (
              <p className="rounded border border-gray-700 bg-[#232428] px-4 py-8 text-center text-sm text-gray-500">
                职位加载中...
              </p>
            ) : null}

            {!positionsLoading && !positionsError && sortedPositions.length === 0 ? (
              <p className="rounded border border-gray-700 bg-[#232428] px-4 py-10 text-center text-sm text-gray-500">
                还没有职位。点击「新增职位」创建第一个招募职位；没有职位时公开页没有可申请岗位。
              </p>
            ) : null}

            {sortedPositions.map((position, index) => {
              const isEditing = editing?.id === position.id;
              const busy = positionBusyId === position.id;
              const cardLocked = busy || positionBusyId !== null || !userId;

              return (
                <div
                  key={position.id}
                  className={`rounded-lg border p-4 ${
                    isEditing ? 'border-blue-500/50 bg-[#232428]' : 'border-gray-700 bg-[#232428]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-bold text-white">{position.name}</h3>
                        {position.department && (
                          <span className="rounded border border-gray-600 bg-[#18191c] px-2 py-0.5 text-xs text-gray-300">
                            {position.department}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${
                            position.is_open
                              ? 'border-green-500/40 bg-green-500/15 text-green-300'
                              : 'border-gray-600 bg-[#18191c] text-gray-400'
                          }`}
                        >
                          {position.is_open ? '申请开放' : '申请关闭'}
                        </span>
                        <span className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-300">
                          授予角色：{roleLabel(position.assign_role)}
                        </span>
                        {position.is_trainee && (
                          <span className="rounded border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-xs text-purple-300">
                            实习岗位
                          </span>
                        )}
                        <span className="text-xs text-gray-500">排序 {position.sort_order}</span>
                        <span className="text-xs text-gray-500">
                          {position.questions.length} 个问题
                        </span>
                      </div>
                      {position.description && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-400">
                          {position.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">申请开关</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={position.is_open}
                        aria-label={`${position.name}申请开关`}
                        onClick={() => void togglePosition(position)}
                        disabled={cardLocked}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          position.is_open ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            position.is_open ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-700/60 pt-3">
                    <button
                      type="button"
                      onClick={() => void movePosition(position, -1)}
                      disabled={cardLocked || index === 0}
                      className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ↑ 上移
                    </button>
                    <button
                      type="button"
                      onClick={() => void movePosition(position, 1)}
                      disabled={cardLocked || index === sortedPositions.length - 1}
                      className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ↓ 下移
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(position)}
                      disabled={cardLocked || isEditing}
                      className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isEditing ? '编辑中...' : '✏️ 编辑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePosition(position)}
                      disabled={cardLocked}
                      className="rounded border border-gray-600 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🗑️ 删除
                    </button>
                    {busy && <span className="text-xs text-gray-400">保存中...</span>}
                  </div>

                  {isEditing && editing && (
                    <div className="mt-4 border-t border-gray-700/60 pt-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label htmlFor={`edit-name-${editing.id}`} className={labelClass}>
                            职位名称 *
                          </label>
                          <input
                            id={`edit-name-${editing.id}`}
                            type="text"
                            value={editing.name}
                            onChange={(event) => updateEditor({ name: event.target.value })}
                            maxLength={80}
                            disabled={editorBusy}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-department-${editing.id}`} className={labelClass}>
                            部门
                          </label>
                          <input
                            id={`edit-department-${editing.id}`}
                            type="text"
                            value={editing.department}
                            onChange={(event) => updateEditor({ department: event.target.value })}
                            maxLength={80}
                            disabled={editorBusy}
                            className={inputClass}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label htmlFor={`edit-description-${editing.id}`} className={labelClass}>
                            职位说明
                          </label>
                          <textarea
                            id={`edit-description-${editing.id}`}
                            value={editing.description}
                            onChange={(event) => updateEditor({ description: event.target.value })}
                            rows={3}
                            maxLength={1000}
                            disabled={editorBusy}
                            className={`${inputClass} resize-y`}
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-assign-role-${editing.id}`} className={labelClass}>
                            通过后授予角色
                          </label>
                          <select
                            id={`edit-assign-role-${editing.id}`}
                            value={editing.assign_role}
                            onChange={(event) => updateEditor({ assign_role: event.target.value })}
                            disabled={editorBusy}
                            className={inputClass}
                          >
                            <option value="">不授予角色</option>
                            {editing.assign_role !== '' &&
                              !roleByName.has(editing.assign_role) && (
                                <option value={editing.assign_role}>
                                  {editing.assign_role}（角色表中不存在）
                                </option>
                              )}
                            {roles.map((role) => (
                              <option key={role.name} value={role.name}>
                                {formatRoleOption(role)}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-gray-500">
                            通过申请时授予；留空表示不自动授予角色。
                            {rolesLoading ? ' 角色加载中...' : ''}
                          </p>
                        </div>
                        <div>
                          <span className={labelClass}>实习岗位</span>
                          <label className="flex items-center gap-2 pb-2.5 text-sm text-gray-300">
                            <input
                              id={`edit-is-trainee-${editing.id}`}
                              type="checkbox"
                              checked={editing.is_trainee}
                              onChange={(event) =>
                                updateEditor({ is_trainee: event.target.checked })
                              }
                              disabled={editorBusy}
                              className="h-4 w-4"
                            />
                            该职位为实习岗位
                          </label>
                          <p className="mt-1 text-xs text-gray-500">
                            勾选后通过申请授予实习角色，转正时改为授予「通过后授予角色」。
                          </p>
                        </div>
                        {editing.is_trainee && (
                          <div className="md:col-span-2">
                            <label
                              htmlFor={`edit-trainee-role-${editing.id}`}
                              className={labelClass}
                            >
                              实习角色
                            </label>
                            <select
                              id={`edit-trainee-role-${editing.id}`}
                              value={editing.trainee_role}
                              onChange={(event) =>
                                updateEditor({ trainee_role: event.target.value })
                              }
                              disabled={editorBusy}
                              className={inputClass}
                            >
                              <option value="">不授予实习角色</option>
                              {editing.trainee_role !== '' &&
                                !traineeRoles.some(
                                  (role) => role.name === editing.trainee_role
                                ) && (
                                  <option value={editing.trainee_role}>
                                    {roleLabel(editing.trainee_role)}
                                  </option>
                                )}
                              {traineeRoles.map((role) => (
                                <option key={role.name} value={role.name}>
                                  {formatRoleOption(role)}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                              仅列出 roles 中 name 含 _trainee 或名称含「实习」的角色。
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-white">
                            问题设置（{editing.questions.length}）
                          </h4>
                          <button
                            type="button"
                            onClick={addQuestion}
                            disabled={editorBusy}
                            className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
                          >
                            ➕ 新增问题
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          问题 ID 自动生成且唯一；申请人提交后按此顺序展示。选择题每行一个选项。
                        </p>

                        {editing.questions.length === 0 ? (
                          <p className="mt-3 rounded border border-dashed border-gray-600 px-4 py-6 text-center text-xs text-gray-500">
                            该职位暂无专属问题，申请人只需填写联系方式与基础信息。
                          </p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {editing.questions.map((question, questionIndex) => (
                              <div
                                key={question.id}
                                className="rounded border border-gray-700 bg-[#18191c] p-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs text-gray-500">
                                    问题 {questionIndex + 1} · ID {question.id} ·{' '}
                                    {QUESTION_TYPE_LABELS[question.type]}
                                  </span>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      aria-label="上移问题"
                                      onClick={() => moveQuestion(questionIndex, -1)}
                                      disabled={editorBusy || questionIndex === 0}
                                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 transition hover:text-white disabled:opacity-40"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="下移问题"
                                      onClick={() => moveQuestion(questionIndex, 1)}
                                      disabled={
                                        editorBusy ||
                                        questionIndex === editing.questions.length - 1
                                      }
                                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 transition hover:text-white disabled:opacity-40"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeQuestion(questionIndex)}
                                      disabled={editorBusy}
                                      className="rounded border border-gray-600 px-2 py-1 text-xs text-red-300 transition hover:border-red-500 hover:text-red-200 disabled:opacity-40"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-2 grid gap-2">
                                  <div>
                                    <label
                                      htmlFor={`question-label-${question.id}`}
                                      className={labelClass}
                                    >
                                      题目
                                    </label>
                                    <input
                                      id={`question-label-${question.id}`}
                                      type="text"
                                      value={question.label}
                                      onChange={(event) =>
                                        updateQuestion(questionIndex, { label: event.target.value })
                                      }
                                      maxLength={200}
                                      placeholder="例如：为什么想申请这个职位？"
                                      disabled={editorBusy}
                                      className={inputClass}
                                    />
                                  </div>

                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                      <label
                                        htmlFor={`question-type-${question.id}`}
                                        className={labelClass}
                                      >
                                        类型
                                      </label>
                                      <select
                                        id={`question-type-${question.id}`}
                                        value={question.type}
                                        onChange={(event) => {
                                          const nextType = event.target.value;
                                          if (
                                            nextType === 'text' ||
                                            nextType === 'textarea' ||
                                            nextType === 'select'
                                          ) {
                                            updateQuestion(questionIndex, { type: nextType });
                                          }
                                        }}
                                        disabled={editorBusy}
                                        className={inputClass}
                                      >
                                        {QUESTION_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <label className="flex items-center gap-2 self-end pb-2.5 text-xs text-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={question.required}
                                        onChange={(event) =>
                                          updateQuestion(questionIndex, {
                                            required: event.target.checked,
                                          })
                                        }
                                        disabled={editorBusy}
                                        className="h-4 w-4"
                                      />
                                      必填
                                    </label>
                                  </div>

                                  {question.type === 'select' && (
                                    <div>
                                      <label
                                        htmlFor={`question-options-${question.id}`}
                                        className={labelClass}
                                      >
                                        选项（每行一个）
                                      </label>
                                      <textarea
                                        id={`question-options-${question.id}`}
                                        value={question.optionsText}
                                        onChange={(event) =>
                                          updateQuestion(questionIndex, {
                                            optionsText: event.target.value,
                                          })
                                        }
                                        rows={3}
                                        placeholder={'是\n否'}
                                        disabled={editorBusy}
                                        className={`${inputClass} resize-y`}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {editorError && (
                        <p role="alert" className="mt-3 break-all text-sm text-red-300">
                          {editorError}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEditor()}
                          disabled={editorBusy}
                          className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {editorBusy ? '保存中...' : '保存职位'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditor}
                          disabled={editorBusy}
                          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-50"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= 申请列表 ================= */}
        <section className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 md:flex-row md:items-end">
          <div className="w-full md:w-44">
            <label htmlFor="application-status-filter" className={labelClass}>
              状态筛选
            </label>
            <select
              id="application-status-filter"
              value={statusFilter}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || isRecruitmentStatus(value)) {
                  setStatusFilter(value);
                  setPage(1);
                  setDecision(null);
                  setExpandedAnswers({});
                  setListNotice(null);
                }
              }}
              disabled={applicationsLoading}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-56">
            <label htmlFor="application-position-filter" className={labelClass}>
              职位筛选
            </label>
            <select
              id="application-position-filter"
              value={positionFilter === 'all' ? 'all' : String(positionFilter)}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all') {
                  setPositionFilter('all');
                } else {
                  const parsed = Number(value);
                  if (Number.isInteger(parsed)) setPositionFilter(parsed);
                }
                setPage(1);
                setDecision(null);
                setExpandedAnswers({});
                setListNotice(null);
              }}
              disabled={applicationsLoading}
              className={inputClass}
            >
              <option value="all">全部职位</option>
              {sortedPositions.map((position) => (
                <option key={position.id} value={String(position.id)}>
                  {position.name}
                  {position.is_open ? '' : '（已关闭）'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <button
              type="button"
              onClick={reloadApplications}
              disabled={applicationsLoading}
              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
            >
              {applicationsLoading ? '刷新中...' : '刷新'}
            </button>
            <span className="text-xs text-gray-500">
              共 {totalCount} 条 · 第 {currentPage} / {totalPages} 页（每页 {PAGE_SIZE} 条）
            </span>
          </div>
        </section>

        {applicationsError && (
          <ErrorBox
            prefix="申请加载失败："
            message={applicationsError}
            onRetry={reloadApplications}
            busy={applicationsLoading}
          />
        )}

        <NoticeLine notice={listNotice} className="mb-4" />

        <div ref={listTopRef} className="scroll-mt-6">
          {applicationsLoading && applications.length === 0 ? (
            <div aria-busy="true" aria-live="polite" className="space-y-4">
              <p className="text-center text-sm text-gray-500">加载中...</p>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-lg border border-gray-700/40 bg-[#232428]"
                />
              ))}
            </div>
          ) : null}

          {!applicationsLoading && !applicationsError && applications.length === 0 ? (
            <p className="rounded border border-gray-700 bg-[#2c2d31] px-4 py-12 text-center text-sm text-gray-500">
              {hasFilter ? '没有符合当前筛选条件的申请。' : '暂无招募申请。'}
            </p>
          ) : null}

          {applications.length > 0 ? (
            <>
              <ul
                aria-busy={applicationsLoading}
                className={`space-y-4 transition-opacity ${applicationsLoading ? 'opacity-60' : ''}`}
              >
                {applications.map((application) => {
                  const meta = STATUS_META[application.status];
                  const busy = busyApplicationId === application.id;
                  const applicant = profiles[application.user_id] ?? null;
                  const position =
                    application.position_id !== null
                      ? positionById.get(application.position_id) ?? null
                      : null;
                  const positionName =
                    position?.name ?? (application.position.trim() || '未知职位');
                  const positionDeleted = application.position_id === null;
                  const activeDecision =
                    decision !== null && decision.applicationId === application.id
                      ? decision
                      : null;

                  const answerEntries = buildAnswerEntries(application, position);
                  const isExpanded = expandedAnswers[application.id] === true;
                  const collapsible =
                    answerEntries.length > ANSWER_PREVIEW_ITEMS ||
                    answerEntries.some((entry) => entry.value.length > ANSWER_PREVIEW_CHARS);
                  const visibleAnswers = isExpanded
                    ? answerEntries
                    : answerEntries.slice(0, ANSWER_PREVIEW_ITEMS);

                  return (
                    <li
                      key={application.id}
                      className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 text-xs text-white">
                          {positionName}
                        </span>
                        {positionDeleted && (
                          <span className="rounded border border-gray-600 bg-[#18191c] px-2 py-0.5 text-[10px] text-gray-500">
                            职位已删除
                          </span>
                        )}
                        <span className="break-all text-xs text-gray-500">#{application.id}</span>
                        <span className="text-xs text-gray-500">
                          {formatTime(application.created_at)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                        <span>申请人：</span>
                        <Link
                          href={`/profile/${application.user_id}`}
                          className="text-blue-400 transition hover:text-blue-300"
                        >
                          {displayName(application.user_id)}
                        </Link>
                        {applicant?.custom_id && (
                          <span className="text-gray-500">（{applicant.custom_id}）</span>
                        )}
                        {applicant?.steam_verified && (
                          <span className="rounded border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-300">
                            Steam 已验证
                          </span>
                        )}
                      </div>

                      <p className="mt-1 break-all text-xs text-gray-400">
                        联系方式：
                        <span className="text-gray-300">{application.contact ?? '——'}</span>
                      </p>

                      <div className="mt-3">
                        <p className="text-xs text-gray-500">问题回答</p>
                        {answerEntries.length === 0 ? (
                          <p className="mt-1 text-sm italic text-gray-500">
                            （该申请没有填写问答内容）
                          </p>
                        ) : (
                          <>
                            <ul className="mt-1 space-y-1">
                              {visibleAnswers.map((entry) => (
                                <li
                                  key={entry.key}
                                  className="whitespace-pre-wrap break-words text-sm text-gray-300"
                                >
                                  <span className="text-gray-400">
                                    {entry.label ?? entry.key}：
                                  </span>
                                  {isExpanded ? entry.value : previewAnswer(entry.value)}
                                  {entry.label === null && (
                                    <span className="ml-1 text-[10px] text-gray-600">
                                      （原始字段）
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                            {!position && answerEntries.length > 0 && (
                              <p className="mt-1 text-xs text-gray-600">
                                职位问题文案不可用（职位已删除或未加载），以上显示数据库原始字段。
                              </p>
                            )}
                            {collapsible && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAnswers((current) => ({
                                    ...current,
                                    [application.id]: !current[application.id],
                                  }))
                                }
                                className="mt-1 text-xs text-blue-400 transition hover:text-blue-300"
                              >
                                {isExpanded ? '收起' : `展开全部（${answerEntries.length} 项）`}
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      <div className="mt-3 border-t border-gray-700/60 pt-3 text-xs text-gray-400">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            处理人：
                            {application.handled_by ? displayName(application.handled_by) : '——'}
                          </span>
                          <span>更新时间：{formatTime(application.updated_at)}</span>
                        </div>
                        {application.handle_note && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-gray-300">
                            处理备注：{application.handle_note}
                          </p>
                        )}
                      </div>

                      {application.status === 'pending' ||
                      application.status === 'reviewing' ? (
                        <div className="mt-4">
                          {activeDecision ? (
                            <div className="rounded border border-blue-500/40 bg-[#232428] p-3">
                              <p className="mb-2 text-sm text-white">
                                将申请 #{application.id} 标记为「
                                {STATUS_META[activeDecision.next].label}」
                              </p>
                              <textarea
                                value={activeDecision.note}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setDecision((current) =>
                                    current && current.applicationId === application.id
                                      ? { ...current, note: value }
                                      : current
                                  );
                                }}
                                rows={3}
                                maxLength={1000}
                                placeholder="处理备注（可选），留空则不写备注；会展示给申请人并随通知发送。"
                                className={`${inputClass} resize-y`}
                              />
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void submitDecision(application)}
                                  disabled={busy || busyApplicationId !== null}
                                  className={`rounded px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    activeDecision.next === 'accepted'
                                      ? 'bg-green-600 hover:bg-green-700'
                                      : 'bg-red-600 hover:bg-red-700'
                                  }`}
                                >
                                  {busy
                                    ? '提交中...'
                                    : activeDecision.next === 'accepted'
                                      ? '确认通过'
                                      : '确认拒绝'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDecision(null)}
                                  disabled={busy}
                                  className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-50"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {application.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => void applyUpdate(application, 'reviewing')}
                                  disabled={busyApplicationId !== null}
                                  className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busy ? '提交中...' : '开始审核'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setListNotice(null);
                                  setDecision({
                                    applicationId: application.id,
                                    next: 'accepted',
                                    note: '',
                                  });
                                }}
                                disabled={busyApplicationId !== null}
                                className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                通过
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setListNotice(null);
                                  setDecision({
                                    applicationId: application.id,
                                    next: 'rejected',
                                    note: '',
                                  });
                                }}
                                disabled={busyApplicationId !== null}
                                className="rounded border border-gray-600 bg-[#232428] px-4 py-2 text-sm text-gray-300 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                拒绝
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {application.status === 'accepted' &&
                  position?.is_trainee === true &&
                  !application.promoted_at && (
                        <div className="mt-4 border-t border-gray-700/60 pt-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void promoteApplication(application)}
                              disabled={busyApplicationId !== null}
                              className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busy ? '转正中...' : '转正'}
                            </button>
                            <span className="text-xs text-gray-500">
                              该职位为实习岗位，转正后授予职位配置的正式角色。
                            </span>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] px-4 py-3 shadow-lg sm:flex-row">
                <p className="text-xs text-gray-500">
                  共 {totalCount} 条 · 第 {currentPage} / {totalPages} 页
                  <span className="ml-2 text-gray-600">（每页 {PAGE_SIZE} 条）</span>
                </p>
                <nav aria-label="招募申请分页" className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={applicationsLoading || currentPage <= 1}
                    className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>

                  {pageItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${index}`} className="px-1 text-xs text-gray-600">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goToPage(item)}
                        disabled={applicationsLoading}
                        aria-current={item === currentPage ? 'page' : undefined}
                        className={`min-w-8 rounded border px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          item === currentPage
                            ? 'border-blue-500 bg-blue-600 font-bold text-white'
                            : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-white'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={applicationsLoading || currentPage >= totalPages}
                    className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </nav>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
