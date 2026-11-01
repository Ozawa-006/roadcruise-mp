// app/vtc/[id]/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';
import { useTr } from '@/components/I18nProvider';

// 英文文案：键为中文原文，缺失时回退中文。
const EN: Record<string, string> = {
  // —— 通用 / 错误前缀 ——
  '操作失败，请稍后重试': 'Something went wrong. Please try again later.',
  '加载车队信息失败：{error}': 'Failed to load VTC info: {error}',
  '加载成员列表失败：{error}': 'Failed to load the member list: {error}',
  '加载申请列表失败：{error}': 'Failed to load applications: {error}',
  '加入失败：{error}': 'Failed to join: {error}',
  '申请失败：{error}': 'Failed to apply: {error}',
  '取消失败：{error}': 'Failed to cancel: {error}',
  '接受邀请失败：{error}': 'Failed to accept the invitation: {error}',
  '拒绝邀请失败：{error}': 'Failed to decline the invitation: {error}',
  '退出失败：{error}': 'Failed to leave: {error}',
  '审核失败：{error}': 'Review failed: {error}',
  '搜索失败：{error}': 'Search failed: {error}',
  '邀请失败：{error}': 'Failed to invite: {error}',
  '设置职位失败：{error}': 'Failed to change the role: {error}',
  '踢出失败：{error}': 'Failed to remove the member: {error}',
  '保存失败：{error}': 'Failed to save: {error}',
  '转让失败：{error}': 'Transfer failed: {error}',
  '解散失败：{error}': 'Failed to dissolve: {error}',
  // —— 职位 / 加入方式 ——
  '队长': 'Owner',
  '副队长': 'Vice owner',
  '调度员': 'Dispatcher',
  '车手': 'Driver',
  '经理': 'Manager',
  '开放加入': 'Open to join',
  '需申请': 'Approval required',
  '仅邀请': 'Invite only',
  // —— 操作提示 ——
  '🎉 成功加入车队！': '🎉 Successfully joined the VTC!',
  '申请已提交，请等待车队管理层审核。':
    'Application submitted. Please wait for the VTC management to review it.',
  '已取消加入申请。': 'Application cancelled.',
  '已接受邀请，欢迎加入车队！': 'Invitation accepted. Welcome to the VTC!',
  '已拒绝该邀请。': 'Invitation declined.',
  '你已退出该车队。': 'You have left the VTC.',
  '已通过该申请。': 'Application approved.',
  '已拒绝该申请。': 'Application declined.',
  '已向 {name} 发送邀请。': 'Invitation sent to {name}.',
  '已将 {name} 设为{role}。': 'Set {name} as {role}.',
  '已将 {name} 移出车队。': 'Removed {name} from the VTC.',
  '✅ 车队设置已保存。': '✅ VTC settings saved.',
  '✅ 车队信息已更新。': '✅ VTC info updated.',
  '车队已转让，你已变为普通车手。':
    'The VTC has been transferred. You are now a regular driver.',
  '请输入玩家昵称或 ID。': 'Enter a player nickname or ID.',
  '搜索内容包含非法字符，请重新输入。':
    'The search contains invalid characters. Please try again.',
  '请输入 DISSOLVE 以确认解散。': 'Type DISSOLVE to confirm dissolving.',
  '请选择新的队长。': 'Select a new owner.',
  '该玩家': 'this player',
  '该成员': 'this member',
  '未命名玩家': 'Unnamed player',
  '未分配': 'Unassigned',
  // —— 确认提示 ——
  '确定要退出该车队吗？': 'Leave this VTC?',
  '确定将 {name} 踢出车队吗？': 'Remove {name} from the VTC?',
  '确定转让车队吗？转让后你将变为普通车手。':
    'Transfer the VTC? You will become a regular driver afterwards.',
  // —— 加载 / 未找到 ——
  '加载车队信息中...': 'Loading VTC info...',
  '车队不存在': 'VTC not found',
  '该车队可能已被解散，或链接有误。':
    'This VTC may have been dissolved, or the link is invalid.',
  '返回车队大厅': 'Back to the VTC lobby',
  // —— 车队概览 ——
  '车队大厅': 'VTC lobby',
  '登录后加入车队': 'Sign in to join this VTC',
  '你已加入其他车队，需先退出才能加入':
    'You are already in another VTC. Leave it before joining this one.',
  '招聘中': 'Recruiting',
  '已停止招募': 'Recruitment closed',
  '{count} 名成员': '{count} members',
  '创建于 {date}': 'Created {date}',
  '我的职位：{role}': 'My role: {role}',
  '这个车队还没有填写简介。': 'This VTC has not added a description yet.',
  '招募要求': 'Recruitment requirements',
  '取消编辑': 'Cancel editing',
  '编辑车队信息': 'Edit VTC info',
  '你是该车队的队长': 'You are the owner of this VTC',
  '处理中...': 'Processing...',
  '退出车队': 'Leave VTC',
  '该车队邀请你加入': 'This VTC has invited you',
  '接受邀请': 'Accept invitation',
  '拒绝': 'Decline',
  '申请审核中': 'Application under review',
  '取消申请': 'Cancel application',
  '立即加入': 'Join now',
  '收起申请': 'Hide application',
  '申请加入': 'Apply to join',
  '仅邀请加入': 'Invite only',
  '你已有其他车队的待审核申请，请先取消':
    'You have a pending application with another VTC. Cancel it first.',
  '← 返回大厅': '← Back to lobby',
  '申请留言（选填）': 'Application note (optional)',
  '介绍一下你的在线时间 / 驾驶经验，方便队长审核...':
    'Tell us about your online hours / driving experience so the owner can review your application...',
  '提交中...': 'Submitting...',
  '提交申请': 'Submit application',
  '取消': 'Cancel',
  // —— 编辑表单 ——
  '车队全名 *': 'VTC full name *',
  '车队标签 (Tag)': 'VTC tag',
  '车队 Logo 链接': 'VTC logo URL',
  '车队简介 *': 'VTC description *',
  '开放招募': 'Recruiting',
  '保存中...': 'Saving...',
  '保存修改': 'Save changes',
  // —— 申请审核 ——
  '申请审核': 'Applications',
  '待审核 {count} 条': '{count} pending',
  '暂无待审核的加入申请。': 'No pending applications.',
  '（未填写留言）': '(No note provided)',
  '通过': 'Approve',
  // —— 邀请成员 ——
  '邀请成员': 'Invite members',
  '搜索昵称 / 玩家 ID': 'Search nickname / player ID',
  '输入玩家昵称，或完整 custom_id / random_id':
    'Enter a player nickname, or the full custom_id / random_id',
  '搜索中...': 'Searching...',
  '搜索': 'Search',
  '没有找到可邀请的玩家。': 'No players available to invite.',
  '邀请': 'Invite',
  '已邀请': 'Invited',
  '已在其他车队': 'In another VTC',
  '发送中...': 'Sending...',
  // —— 成员列表 ——
  '车队成员': 'Members',
  '共 {count} 人': '{count} members',
  '车队新闻 →': 'VTC news →',
  '这个车队还没有成员。': 'This VTC has no members yet.',
  '踢出': 'Remove',
  // —— 车队设置 ——
  '车队设置': 'VTC settings',
  '加入方式': 'Join mode',
  '开放加入（立即加入）': 'Open (join instantly)',
  '需要申请（管理员审核）': 'Approval required (management review)',
  '修改后立即对大厅的加入按钮生效。':
    'Takes effect immediately on the join buttons in the lobby.',
  '招募状态': 'Recruitment status',
  '招聘中（点击暂停招募）': 'Recruiting (click to pause)',
  '已停止招募（点击开放）': 'Recruitment closed (click to open)',
  '关闭后申请与直接加入都会被拒绝，邀请仍然可用。':
    'When closed, applications and direct joins are rejected, but invitations still work.',
  '保存车队设置': 'Save VTC settings',
  // —— 危险区 ——
  '危险区': 'Danger zone',
  '转让车队': 'Transfer VTC',
  '将队长身份转让给本队成员，转让后你将成为普通车手。':
    'Transfer ownership to a member. You will become a regular driver afterwards.',
  '暂无可转让的成员。': 'No members available to transfer ownership to.',
  '选择新队长...': 'Select a new owner...',
  '{name}（{role}）': '{name} ({role})',
  '解散车队': 'Dissolve VTC',
  '解散后车队与成员关系将无法恢复。请输入': 'Dissolving cannot be undone. Type',
  '确认。': 'to confirm.',
  '永久解散车队': 'Dissolve VTC permanently',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type JoinMode = 'open' | 'approval' | 'invite';
type AssignableRole = 'vice_owner' | 'dispatcher' | 'member';

interface Vtc {
  id: number;
  name: string;
  tag: string | null;
  logo_url: string | null;
  description: string | null;
  requirements: string | null;
  is_recruiting: boolean | null;
  owner_id: string | null;
  join_mode: string | null;
  created_at: string | null;
}

interface VtcMember {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  vtc_role: string | null;
  custom_id: string | null;
  random_id: string | null;
  vtc_id: number | null;
}

interface ApplicantProfile {
  display_name: string | null;
  avatar_url: string | null;
  custom_id: string | null;
  random_id: string | null;
}

interface VtcApplication {
  id: number;
  user_id: string;
  message: string | null;
  status: string;
  created_at: string;
  profiles: ApplicantProfile | ApplicantProfile[] | null;
}

interface PendingApplication {
  id: number;
  vtc_id: number;
  status: string;
}

interface PendingInvitation {
  id: number;
  vtc_id: number;
  status: string;
}

interface SearchProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  custom_id: string | null;
  random_id: string | null;
  vtc_id: number | null;
}

interface VtcForm {
  name: string;
  tag: string;
  logo_url: string;
  description: string;
  requirements: string;
  is_recruiting: boolean;
}

// 车队内部职位的中文标签（manager 为历史数据兼容）
const VTC_ROLE_LABELS: Record<string, string> = {
  owner: '队长',
  vice_owner: '副队长',
  dispatcher: '调度员',
  member: '车手',
  manager: '经理',
};

const VTC_ROLE_BADGES: Record<string, string> = {
  owner: 'bg-red-900/30 text-red-400 border border-red-800',
  vice_owner: 'bg-orange-900/30 text-orange-400 border border-orange-800',
  dispatcher: 'bg-blue-900/30 text-blue-400 border border-blue-800',
  member: 'bg-gray-700/40 text-gray-400 border border-gray-600',
  manager: 'bg-purple-900/30 text-purple-400 border border-purple-800',
};

const JOIN_MODE_LABELS: Record<JoinMode, string> = {
  open: '开放加入',
  approval: '需申请',
  invite: '仅邀请',
};

const JOIN_MODE_BADGES: Record<JoinMode, string> = {
  open: 'bg-green-900/30 text-green-400 border border-green-800',
  approval: 'bg-blue-900/30 text-blue-400 border border-blue-800',
  invite: 'bg-purple-900/30 text-purple-400 border border-purple-800',
};

function joinModeOf(mode: string | null | undefined): JoinMode {
  if (mode === 'open' || mode === 'invite') return mode;
  return 'approval';
}

function roleLabelOf(role: string | null | undefined, tr: (zh: string) => string): string {
  return tr((role && VTC_ROLE_LABELS[role]) || '车手');
}

function roleBadgeOf(role: string | null | undefined): string {
  return (role && VTC_ROLE_BADGES[role]) || VTC_ROLE_BADGES.member;
}

function applicantOf(application: VtcApplication): ApplicantProfile | null {
  if (Array.isArray(application.profiles)) return application.profiles[0] ?? null;
  return application.profiles ?? null;
}

function rpcErrorText(error: unknown, tr: (zh: string) => string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return tr('操作失败，请稍后重试');
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <div className="space-y-1">
      {success ? <p className="text-xs text-green-400 font-bold">{success}</p> : null}
      {error ? <p className="text-xs text-red-400 font-bold">{error}</p> : null}
    </div>
  );
}

export default function VTCDetailPage() {
  const tr = useTr(EN);
  const errorText = (prefix: string, error: unknown) =>
    tr(prefix, { error: rpcErrorText(error, tr) });
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const vtcId = typeof rawId === 'string' ? rawId : '';

  const [vtc, setVtc] = useState<Vtc | null>(null);
  const [members, setMembers] = useState<VtcMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 当前登录用户 & 其车队归属
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [myVtcId, setMyVtcId] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  // 当前用户的待处理申请 / 邀请
  const [myApplication, setMyApplication] = useState<PendingApplication | null>(null);
  const [myInvitation, setMyInvitation] = useState<PendingInvitation | null>(null);

  // 管理层：待审核申请
  const [applications, setApplications] = useState<VtcApplication[]>([]);

  // 页面级提示
  const [topNotice, setTopNotice] = useState('');
  const [topError, setTopError] = useState('');

  // 加入相关操作
  const [topBusy, setTopBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');

  // 申请审核
  const [reviewBusyId, setReviewBusyId] = useState<number | null>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [reviewError, setReviewError] = useState('');

  // 邀请成员
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchProfile[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [invitedIds, setInvitedIds] = useState<string[]>([]);

  // 成员管理
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState('');
  const [memberError, setMemberError] = useState('');

  // 车队设置
  const [settingsJoinMode, setSettingsJoinMode] = useState<JoinMode>('approval');
  const [settingsRecruiting, setSettingsRecruiting] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [settingsError, setSettingsError] = useState('');

  // 危险区
  const [transferTarget, setTransferTarget] = useState('');
  const [dissolveText, setDissolveText] = useState('');
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerNotice, setDangerNotice] = useState('');
  const [dangerError, setDangerError] = useState('');

  // 编辑表单
  const [editing, setEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [form, setForm] = useState<VtcForm>({
    name: '',
    tag: '',
    logo_url: '',
    description: '',
    requirements: '',
    is_recruiting: true,
  });

  // 读取车队信息 + 成员列表 + 当前用户归属 + 管理数据
  const loadPage = useCallback(async (initial: boolean) => {
    const numericId = Number(vtcId);
    if (!vtcId || Number.isNaN(numericId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    if (initial) setLoading(true);
    setNotFound(false);
    setTopError('');
    setReviewError('');
    setMemberError('');

    try {
      // 当前用户（未登录时为 null，不影响页面浏览）
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser ? { id: currentUser.id } : null);

      let profileVtcId: number | null = null;
      let profileRole: string | null = null;
      if (currentUser) {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('vtc_id, vtc_role')
          .eq('id', currentUser.id)
          .maybeSingle();
        const profileRow = myProfile as { vtc_id: number | null; vtc_role: string | null } | null;
        profileVtcId = profileRow?.vtc_id ?? null;
        profileRole = profileRow?.vtc_role ?? null;
      }
      setMyVtcId(profileVtcId);
      setMyRole(profileRole);

      // 车队主体信息
      const { data: vtcData, error: vtcError } = await supabase
        .from('vtcs')
        .select('*')
        .eq('id', numericId)
        .maybeSingle();

      if (vtcError) {
        setTopError(errorText('加载车队信息失败：{error}', vtcError));
        return;
      }
      if (!vtcData) {
        setNotFound(true);
        return;
      }

      const row = vtcData as unknown as Vtc;
      setVtc(row);
      setForm({
        name: row.name || '',
        tag: row.tag || '',
        logo_url: row.logo_url || '',
        description: row.description || '',
        requirements: row.requirements || '',
        is_recruiting: row.is_recruiting ?? true,
      });
      setSettingsJoinMode(joinModeOf(row.join_mode));
      setSettingsRecruiting(row.is_recruiting ?? true);

      // 成员列表
      const { data: membersData, error: membersError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, vtc_role, custom_id, random_id, vtc_id')
        .eq('vtc_id', numericId);

      if (membersError) {
        console.error('获取成员列表失败:', membersError);
        setMemberError(errorText('加载成员列表失败：{error}', membersError));
      } else if (membersData) {
        // owner 排最前，其次副队长 / 调度员 / 车手
        const weight: Record<string, number> = {
          owner: 0,
          vice_owner: 1,
          dispatcher: 2,
          manager: 2,
          member: 3,
        };
        setMembers(
          ([...(membersData as unknown as VtcMember[])]).sort(
            (a, b) => (weight[a.vtc_role ?? ''] ?? 9) - (weight[b.vtc_role ?? ''] ?? 9)
          )
        );
      } else {
        setMembers([]);
      }

      // 管理层才读取待审核申请
      const isManager = !!currentUser
        && (row.owner_id === currentUser.id
          || (profileVtcId === row.id && profileRole === 'vice_owner'));

      if (isManager) {
        const { data: appRows, error: appError } = await supabase
          .from('vtc_applications')
          .select('id, user_id, message, status, created_at, profiles!user_id(display_name, avatar_url, custom_id, random_id)')
          .eq('vtc_id', row.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (appError) {
          console.error('获取申请列表失败:', appError);
          setReviewError(errorText('加载申请列表失败：{error}', appError));
          setApplications([]);
        } else {
          setApplications((appRows ?? []) as unknown as VtcApplication[]);
        }
      } else {
        setApplications([]);
      }

      // 未加入车队的登录用户：查询自己的待审核申请 & 本车队邀请
      let pendingApp: PendingApplication | null = null;
      let pendingInvite: PendingInvitation | null = null;

      if (currentUser && profileVtcId === null) {
        const { data: appData, error: appLookupError } = await supabase
          .from('vtc_applications')
          .select('id, vtc_id, status')
          .eq('user_id', currentUser.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (appLookupError) {
          console.error('获取申请状态失败:', appLookupError);
        } else if (appData) {
          pendingApp = appData as unknown as PendingApplication;
        }

        const { data: inviteData, error: inviteLookupError } = await supabase
          .from('vtc_invitations')
          .select('id, vtc_id, status')
          .eq('invited_user_id', currentUser.id)
          .eq('vtc_id', row.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (inviteLookupError) {
          console.error('获取邀请状态失败:', inviteLookupError);
        } else if (inviteData) {
          pendingInvite = inviteData as unknown as PendingInvitation;
        }
      }

      setMyApplication(pendingApp);
      setMyInvitation(pendingInvite);
    } catch (error: unknown) {
      setTopError(errorText('加载车队信息失败：{error}', error));
    } finally {
      setLoading(false);
    }
    // tr 每次渲染都会重新创建，加入依赖会导致重复请求；语言切换由 Provider 刷新页面处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vtcId]);

  useEffect(() => {
    // 在 effect 内启动请求，setState 只发生在 await 之后，不做同步级联更新
    (async () => {
      await loadPage(true);
    })();
  }, [loadPage]);

  // 开放加入
  const handleJoinOpen = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!vtc) return;

    setTopBusy(true);
    setTopError('');
    setTopNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_join_open', { p_vtc_id: vtc.id });
      if (error) throw error;
      setTopNotice(tr('🎉 成功加入车队！'));
      setApplyOpen(false);
      await loadPage(false);
    } catch (error: unknown) {
      setTopError(errorText('加入失败：{error}', error));
    } finally {
      setTopBusy(false);
    }
  };

  // 提交申请
  const handleSubmitApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vtc) return;

    setTopBusy(true);
    setTopError('');
    setTopNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_apply', {
        p_vtc_id: vtc.id,
        p_message: applyMessage.trim(),
      });
      if (error) throw error;
      setApplyOpen(false);
      setApplyMessage('');
      setTopNotice(tr('申请已提交，请等待车队管理层审核。'));
      await loadPage(false);
    } catch (error: unknown) {
      setTopError(errorText('申请失败：{error}', error));
    } finally {
      setTopBusy(false);
    }
  };

  // 取消自己的申请
  const handleCancelApplication = async () => {
    if (!myApplication) return;

    setTopBusy(true);
    setTopError('');
    setTopNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_cancel_application', {
        p_id: myApplication.id,
      });
      if (error) throw error;
      setTopNotice(tr('已取消加入申请。'));
      await loadPage(false);
    } catch (error: unknown) {
      setTopError(errorText('取消失败：{error}', error));
    } finally {
      setTopBusy(false);
    }
  };

  // 接受 / 拒绝邀请
  const handleRespondInvite = async (accept: boolean) => {
    if (!myInvitation) return;

    setTopBusy(true);
    setTopError('');
    setTopNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_respond_invite', {
        p_id: myInvitation.id,
        p_accept: accept,
      });
      if (error) throw error;
      setTopNotice(tr(accept ? '已接受邀请，欢迎加入车队！' : '已拒绝该邀请。'));
      await loadPage(false);
    } catch (error: unknown) {
      setTopError(
        errorText(accept ? '接受邀请失败：{error}' : '拒绝邀请失败：{error}', error)
      );
    } finally {
      setTopBusy(false);
    }
  };

  // 退出车队
  const handleLeave = async () => {
    if (!window.confirm(tr('确定要退出该车队吗？'))) return;

    setTopBusy(true);
    setTopError('');
    setTopNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_leave');
      if (error) throw error;
      setTopNotice(tr('你已退出该车队。'));
      await loadPage(false);
    } catch (error: unknown) {
      setTopError(errorText('退出失败：{error}', error));
    } finally {
      setTopBusy(false);
    }
  };

  // 审核申请
  const handleReview = async (applicationId: number, approve: boolean) => {
    setReviewBusyId(applicationId);
    setReviewError('');
    setReviewNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_review_application', {
        p_id: applicationId,
        p_approve: approve,
      });
      if (error) throw error;
      setReviewNotice(tr(approve ? '已通过该申请。' : '已拒绝该申请。'));
      await loadPage(false);
    } catch (error: unknown) {
      setReviewError(errorText('审核失败：{error}', error));
    } finally {
      setReviewBusyId(null);
    }
  };

  // 搜索可邀请的玩家
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vtc) return;

    const term = searchTerm.trim();
    if (!term) {
      setInviteError(tr('请输入玩家昵称或 ID。'));
      return;
    }

    // 去掉会破坏 PostgREST or 过滤语法的字符
    const safe = term.replace(/[%,()*]/g, ' ').trim();
    if (!safe) {
      setInviteError(tr('搜索内容包含非法字符，请重新输入。'));
      return;
    }

    setSearchBusy(true);
    setInviteError('');
    setInviteNotice('');

    try {
      let query = supabase
        .from('profiles')
        .select('id, display_name, avatar_url, custom_id, random_id, vtc_id');

      if (/^\d+$/.test(safe)) {
        // 纯数字才同时匹配 custom_id / random_id（与全站搜索保持一致）
        query = query.or(`display_name.ilike.%${safe}%,custom_id.eq.${safe},random_id.eq.${safe}`);
      } else {
        query = query.ilike('display_name', `%${safe}%`);
      }

      const { data, error } = await query.limit(8);

      if (error) throw error;

      const rows = ((data ?? []) as unknown as SearchProfile[]).filter(
        (profile) => profile.vtc_id !== vtc.id
      );
      setSearchResults(rows);
      setSearchDone(true);
    } catch (error: unknown) {
      setInviteError(errorText('搜索失败：{error}', error));
      setSearchResults([]);
      setSearchDone(true);
    } finally {
      setSearchBusy(false);
    }
  };

  // 邀请成员
  const handleInvite = async (profile: SearchProfile) => {
    setInviteBusyId(profile.id);
    setInviteError('');
    setInviteNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_invite', { p_user_id: profile.id });
      if (error) throw error;
      setInvitedIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]));
      setInviteNotice(
        tr('已向 {name} 发送邀请。', { name: profile.display_name || tr('该玩家') })
      );
    } catch (error: unknown) {
      setInviteError(errorText('邀请失败：{error}', error));
    } finally {
      setInviteBusyId(null);
    }
  };

  // 设置成员职位（仅队长可见/可用）
  const handleSetRole = async (member: VtcMember, role: AssignableRole) => {
    setMemberBusyId(member.id);
    setMemberError('');
    setMemberNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_set_role', {
        p_user_id: member.id,
        p_role: role,
      });
      if (error) throw error;
      setMemberNotice(
        tr('已将 {name} 设为{role}。', {
          name: member.display_name || tr('该成员'),
          role: roleLabelOf(role, tr),
        })
      );
      await loadPage(false);
    } catch (error: unknown) {
      setMemberError(errorText('设置职位失败：{error}', error));
    } finally {
      setMemberBusyId(null);
    }
  };

  const handleRoleSelect = (member: VtcMember, value: string) => {
    if (value !== 'vice_owner' && value !== 'dispatcher' && value !== 'member') return;
    if (value === member.vtc_role) return;
    void handleSetRole(member, value);
  };

  // 踢出成员（仅队长可见/可用）
  const handleKick = async (member: VtcMember) => {
    const name = member.display_name || tr('该成员');
    if (!window.confirm(tr('确定将 {name} 踢出车队吗？', { name }))) return;

    setMemberBusyId(member.id);
    setMemberError('');
    setMemberNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_kick', { p_user_id: member.id });
      if (error) throw error;
      setMemberNotice(tr('已将 {name} 移出车队。', { name }));
      await loadPage(false);
    } catch (error: unknown) {
      setMemberError(errorText('踢出失败：{error}', error));
    } finally {
      setMemberBusyId(null);
    }
  };

  // 保存车队设置（owner 直接更新 vtcs）
  const handleSaveSettings = async () => {
    if (!vtc) return;

    setSettingsBusy(true);
    setSettingsError('');
    setSettingsNotice('');

    try {
      const { error } = await supabase
        .from('vtcs')
        .update({
          join_mode: settingsJoinMode,
          is_recruiting: settingsRecruiting,
        })
        .eq('id', vtc.id);

      if (error) throw error;
      setSettingsNotice(tr('✅ 车队设置已保存。'));
      await loadPage(false);
    } catch (error: unknown) {
      setSettingsError(errorText('保存失败：{error}', error));
    } finally {
      setSettingsBusy(false);
    }
  };

  // 保存编辑（仅队长）
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vtc) return;

    setSaveBusy(true);
    setTopError('');
    setTopNotice('');

    try {
      const { error } = await supabase
        .from('vtcs')
        .update({
          name: form.name.trim(),
          tag: form.tag.trim().toUpperCase(),
          logo_url: form.logo_url.trim(),
          description: form.description,
          requirements: form.requirements,
          is_recruiting: form.is_recruiting,
        })
        .eq('id', vtc.id);

      if (error) throw error;
      setTopNotice(tr('✅ 车队信息已更新。'));
      setEditing(false);
      await loadPage(false);
    } catch (error: unknown) {
      setTopError(errorText('保存失败：{error}', error));
    } finally {
      setSaveBusy(false);
    }
  };

  // 转让车队（仅队长）
  const handleTransfer = async () => {
    if (!vtc) return;
    if (!transferTarget) {
      setDangerError(tr('请选择新的队长。'));
      return;
    }
    if (!window.confirm(tr('确定转让车队吗？转让后你将变为普通车手。'))) return;

    setDangerBusy(true);
    setDangerError('');
    setDangerNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_transfer', {
        p_new_owner: transferTarget,
      });
      if (error) throw error;
      setTransferTarget('');
      setTopNotice(tr('车队已转让，你已变为普通车手。'));
      await loadPage(false);
    } catch (error: unknown) {
      setDangerError(errorText('转让失败：{error}', error));
    } finally {
      setDangerBusy(false);
    }
  };

  // 解散车队（仅队长，需输入 DISSOLVE）
  const handleDissolve = async () => {
    if (!vtc) return;
    if (dissolveText !== 'DISSOLVE') {
      setDangerError(tr('请输入 DISSOLVE 以确认解散。'));
      return;
    }

    setDangerBusy(true);
    setDangerError('');
    setDangerNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_dissolve', {
        p_confirm: 'DISSOLVE',
      });
      if (error) throw error;
      router.push('/vtc');
    } catch (error: unknown) {
      setDangerError(errorText('解散失败：{error}', error));
    } finally {
      setDangerBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">
        {tr('加载车队信息中...')}
      </div>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 flex flex-col justify-center items-center gap-4">
          <p className="text-4xl">🚛</p>
          <h1 className="text-xl font-bold text-white">{tr('车队不存在')}</h1>
          <p className="text-sm text-gray-500">{tr('该车队可能已被解散，或链接有误。')}</p>
          <Link href="/vtc" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition">
            {tr('返回车队大厅')}
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = !!user && !!vtc && vtc.owner_id === user.id;
  const isMember = !!user && !!vtc && myVtcId === vtc.id;
  const isManager = isOwner || (isMember && myRole === 'vice_owner');
  const inOtherVtc = !!user && myVtcId !== null && myVtcId !== vtc?.id;
  const joinMode = joinModeOf(vtc?.join_mode);
  const recruiting = vtc?.is_recruiting !== false;
  const myApplicationForThis = !!myApplication && !!vtc && myApplication.vtc_id === vtc.id;
  const hasOtherPendingApplication = !!myApplication && !!vtc && myApplication.vtc_id !== vtc.id;
  const canUseJoinActions = !!user && myVtcId === null && !isOwner;
  const transferCandidates = vtc
    ? members.filter((member) => member.id !== vtc.owner_id && member.vtc_role !== 'owner')
    : [];

  const inputClass =
    'w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500';

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      {/* 顶部横幅 */}
      <div className="w-full h-40 relative bg-[url('https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 to-black/40"></div>
        <div className="absolute inset-0 flex flex-col justify-center max-w-5xl mx-auto w-full px-4 md:px-8">
          <div className="text-sm text-gray-400 mb-2">
            <Link href="/vtc" className="hover:text-white transition">{tr('车队大厅')}</Link>
            <span className="mx-2">/</span>
            <span className="text-white font-bold">{vtc?.name}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg line-clamp-1">
            {vtc?.name}
          </h1>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 -mt-6 relative z-10 space-y-6">
        {/* 提示信息 */}
        {(topNotice || topError) && (
          <div className="space-y-2">
            {topNotice && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded text-sm font-bold">
                {topNotice}
              </div>
            )}
            {topError && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded text-sm font-bold">
                {topError}
              </div>
            )}
          </div>
        )}

        {/* 车队概览卡片 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row gap-6 items-start">
            <div className="w-24 h-24 bg-[#18191c] rounded-lg border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center shadow-md">
              {vtc?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vtc.logo_url} alt={vtc.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">🏢</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-white">{vtc?.name}</h2>
                {vtc?.tag && (
                  <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded font-mono border border-blue-800">
                    [{vtc.tag}]
                  </span>
                )}
                <span className={`text-xs font-bold px-2 py-1 rounded ${JOIN_MODE_BADGES[joinMode]}`}>
                  {tr(JOIN_MODE_LABELS[joinMode])}
                </span>
                {vtc?.is_recruiting ? (
                  <span className="text-xs text-green-500 font-bold bg-green-900/20 px-2 py-1 rounded">
                    {tr('招聘中')}
                  </span>
                ) : (
                  <span className="text-xs text-red-500 font-bold bg-red-900/20 px-2 py-1 rounded">
                    {tr('已停止招募')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                <span>{tr('{count} 名成员', { count: members.length })}</span>
                {vtc?.created_at && (
                  <span>
                    {tr('创建于 {date}', {
                      date: new Date(vtc.created_at).toLocaleDateString(),
                    })}
                  </span>
                )}
                {isMember && (
                  <span className="text-blue-400 font-bold">
                    {tr('我的职位：{role}', { role: roleLabelOf(myRole, tr) })}
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                {vtc?.description || tr('这个车队还没有填写简介。')}
              </p>
            </div>
          </div>

          {vtc?.requirements && (
            <div className="px-6 pb-6">
              <div className="bg-[#232428] border border-gray-700 rounded-lg p-4">
                <h3 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">
                  {tr('招募要求')}
                </h3>
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{vtc.requirements}</p>
              </div>
            </div>
          )}

          {/* 操作区：根据身份显示不同按钮 */}
          <div className="px-6 py-4 bg-[#232428] border-t border-gray-700/60 flex flex-wrap items-center gap-3">
            {!user && (
              <Link
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg"
              >
                {tr('登录后加入车队')}
              </Link>
            )}

            {inOtherVtc && (
              <span className="text-sm text-yellow-400 font-bold bg-yellow-900/20 px-4 py-2.5 rounded border border-yellow-800">
                {tr('你已加入其他车队，需先退出才能加入')}
              </span>
            )}

            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing((value) => !value)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg"
                >
                  {editing ? tr('取消编辑') : tr('编辑车队信息')}
                </button>
                <span className="text-sm text-gray-500 font-bold bg-[#18191c] px-4 py-2.5 rounded border border-gray-700">
                  {tr('你是该车队的队长')}
                </span>
              </>
            )}

            {/* 成员（非队长）可以退出 */}
            {isMember && !isOwner && (
              <button
                type="button"
                onClick={handleLeave}
                disabled={topBusy}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg disabled:opacity-50"
              >
                {topBusy ? tr('处理中...') : tr('退出车队')}
              </button>
            )}

            {/* 非成员：邀请 / 申请 / 开放加入 */}
            {canUseJoinActions && (
              <>
                {myInvitation && (
                  <div className="flex flex-wrap items-center gap-2 bg-yellow-900/20 border border-yellow-800 rounded px-3 py-2">
                    <span className="text-sm font-bold text-yellow-400">
                      {tr('该车队邀请你加入')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRespondInvite(true)}
                      disabled={topBusy}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                    >
                      {tr('接受邀请')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespondInvite(false)}
                      disabled={topBusy}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                    >
                      {tr('拒绝')}
                    </button>
                  </div>
                )}

                {myApplicationForThis && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-yellow-400 font-bold bg-yellow-900/20 px-4 py-2.5 rounded border border-yellow-800">
                      {tr('申请审核中')}
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelApplication}
                      disabled={topBusy}
                      className="bg-[#18191c] border border-gray-600 hover:border-red-500 hover:text-red-400 text-gray-300 px-4 py-2.5 rounded font-bold transition disabled:opacity-50"
                    >
                      {topBusy ? tr('处理中...') : tr('取消申请')}
                    </button>
                  </div>
                )}

                {!myInvitation && !myApplication && (
                  <>
                    {joinMode === 'open' && (
                      <button
                        type="button"
                        onClick={handleJoinOpen}
                        disabled={topBusy || !recruiting}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg disabled:opacity-50"
                      >
                        {topBusy
                          ? tr('处理中...')
                          : recruiting
                            ? tr('立即加入')
                            : tr('已停止招募')}
                      </button>
                    )}

                    {joinMode === 'approval' && (
                      <button
                        type="button"
                        onClick={() => setApplyOpen((value) => !value)}
                        disabled={topBusy || !recruiting}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg disabled:opacity-50"
                      >
                        {recruiting
                          ? applyOpen
                            ? tr('收起申请')
                            : tr('申请加入')
                          : tr('已停止招募')}
                      </button>
                    )}

                    {joinMode === 'invite' && (
                      <button
                        type="button"
                        disabled
                        className="bg-[#18191c] border border-gray-700 text-gray-500 px-6 py-2.5 rounded font-bold cursor-not-allowed"
                      >
                        {tr('仅邀请加入')}
                      </button>
                    )}
                  </>
                )}

                {!myInvitation && hasOtherPendingApplication && (
                  <span className="text-sm text-yellow-400 font-bold bg-yellow-900/20 px-4 py-2.5 rounded border border-yellow-800">
                    {tr('你已有其他车队的待审核申请，请先取消')}
                  </span>
                )}
              </>
            )}

            <Link
              href="/vtc"
              className="ml-auto text-sm text-gray-400 hover:text-white transition font-bold"
            >
              {tr('← 返回大厅')}
            </Link>
          </div>

          {/* 申请留言内联表单 */}
          {canUseJoinActions && !myInvitation && !myApplication && joinMode === 'approval' && applyOpen && (
            <form onSubmit={handleSubmitApply} className="px-6 py-4 bg-[#232428] border-t border-gray-700/60 space-y-3">
              <label className="block text-sm font-bold text-gray-400">
                {tr('申请留言（选填）')}
              </label>
              <textarea
                value={applyMessage}
                onChange={(e) => setApplyMessage(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder={tr('介绍一下你的在线时间 / 驾驶经验，方便队长审核...')}
                className={inputClass}
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={topBusy}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition disabled:opacity-50"
                >
                  {topBusy ? tr('提交中...') : tr('提交申请')}
                </button>
                <button
                  type="button"
                  onClick={() => setApplyOpen(false)}
                  disabled={topBusy}
                  className="text-sm text-gray-400 hover:text-white font-bold disabled:opacity-50"
                >
                  {tr('取消')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 编辑表单（仅队长可见） */}
        {isOwner && editing && (
          <form
            onSubmit={handleSave}
            className="bg-[#2c2d31] border border-gray-700 p-6 md:p-8 rounded-xl shadow-2xl space-y-6"
          >
            <h2 className="text-lg font-bold text-white border-b border-gray-700 pb-3">
              {tr('编辑车队信息')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-400 mb-2">
                  {tr('车队全名 *')}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">
                  {tr('车队标签 (Tag)')}
                </label>
                <input
                  type="text"
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  maxLength={5}
                  className={`${inputClass} uppercase`}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">
                {tr('车队 Logo 链接')}
              </label>
              <input
                type="url"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                className={inputClass}
                placeholder="https://i.imgur.com/xxxxx.jpg"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">
                {tr('车队简介 *')}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={`${inputClass} h-32`}
                required
              ></textarea>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">
                {tr('招募要求')}
              </label>
              <textarea
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                className={`${inputClass} h-24`}
              ></textarea>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_recruiting}
                  onChange={(e) => setForm({ ...form, is_recruiting: e.target.checked })}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm text-gray-300 font-bold">{tr('开放招募')}</span>
              </label>

              <button
                type="submit"
                disabled={saveBusy}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded font-bold transition shadow-lg disabled:opacity-50"
              >
                {saveBusy ? tr('保存中...') : tr('保存修改')}
              </button>
            </div>
          </form>
        )}

        {/* 管理层：申请审核 */}
        {isManager && (
          <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('申请审核')}</span>
              </div>
              <span className="text-xs text-gray-500">
                {tr('待审核 {count} 条', { count: applications.length })}
              </span>
            </div>

            <div className="p-6 space-y-4">
              <Feedback error={reviewError} success={reviewNotice} />

              {applications.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  {tr('暂无待审核的加入申请。')}
                </p>
              ) : (
                <ul className="space-y-3">
                  {applications.map((application) => {
                    const applicant = applicantOf(application);
                    const name = applicant?.display_name || tr('未命名玩家');
                    const busy = reviewBusyId !== null;

                    return (
                      <li
                        key={application.id}
                        className="bg-[#232428] border border-gray-700 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#18191c] border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center">
                          {applicant?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={applicant.avatar_url} alt={name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-gray-500">{name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/profile/${application.user_id}`}
                              className="text-sm font-bold text-white hover:text-blue-400 transition"
                            >
                              {name}
                            </Link>
                            <span className="text-xs text-gray-500 font-mono">
                              ID: {applicant?.custom_id || applicant?.random_id || tr('未分配')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(application.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 mt-1 whitespace-pre-wrap break-words">
                            {application.message || tr('（未填写留言）')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleReview(application.id, true)}
                            disabled={busy}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                          >
                            {reviewBusyId === application.id ? tr('处理中...') : tr('通过')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(application.id, false)}
                            disabled={busy}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                          >
                            {tr('拒绝')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* 管理层：邀请成员 */}
        {isManager && (
          <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>
                <span className="text-sm font-bold text-gray-400">{tr('邀请成员')}</span>
              </div>
              <span className="text-xs text-gray-500">{tr('搜索昵称 / 玩家 ID')}</span>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={tr('输入玩家昵称，或完整 custom_id / random_id')}
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={searchBusy}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-bold transition shrink-0 disabled:opacity-50"
                >
                  {searchBusy ? tr('搜索中...') : tr('搜索')}
                </button>
              </form>

              <Feedback error={inviteError} success={inviteNotice} />

              {searchDone && searchResults.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  {tr('没有找到可邀请的玩家。')}
                </p>
              )}

              {searchResults.length > 0 && (
                <ul className="divide-y divide-gray-700/60 border border-gray-700 rounded-lg overflow-hidden">
                  {searchResults.map((profile) => {
                    const name = profile.display_name || tr('未命名玩家');
                    const inOtherTeam = profile.vtc_id !== null;
                    const invited = invitedIds.includes(profile.id);
                    const busy = inviteBusyId !== null;

                    return (
                      <li key={profile.id} className="flex items-center gap-3 px-4 py-3 bg-[#232428]">
                        <div className="w-9 h-9 rounded-full bg-[#18191c] border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center">
                          {profile.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-gray-500">{name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/profile/${profile.id}`}
                            className="text-sm font-bold text-white hover:text-blue-400 transition truncate block"
                          >
                            {name}
                          </Link>
                          <p className="text-xs text-gray-500 font-mono truncate">
                            ID: {profile.custom_id || profile.random_id || tr('未分配')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleInvite(profile)}
                          disabled={busy || invited || inOtherTeam}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50 shrink-0"
                        >
                          {invited
                            ? tr('已邀请')
                            : inOtherTeam
                              ? tr('已在其他车队')
                              : inviteBusyId === profile.id
                                ? tr('发送中...')
                                : tr('邀请')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* 成员列表 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
              <span className="text-sm font-bold text-gray-400">{tr('车队成员')}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500">
                {tr('共 {count} 人', { count: members.length })}
              </span>
              {vtc && (
                <Link
                  href={`/vtc/${vtc.id}/news`}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 transition"
                >
                  {tr('车队新闻 →')}
                </Link>
              )}
            </div>
          </div>

          <div className="px-6 pt-3">
            <Feedback error={memberError} success={memberNotice} />
          </div>

          {members.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-12">
              {tr('这个车队还没有成员。')}
            </div>
          ) : (
            <ul className="divide-y divide-gray-700/60">
              {members.map((member) => {
                const displayName = member.display_name || tr('未命名玩家');
                const isOwnerRow = member.id === vtc?.owner_id || member.vtc_role === 'owner';
                const canManage = isOwner && !isOwnerRow;
                const roleValue = member.vtc_role === 'vice_owner'
                  || member.vtc_role === 'dispatcher'
                  || member.vtc_role === 'member'
                  ? member.vtc_role
                  : 'member';

                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center gap-4 px-6 py-3 hover:bg-[#232428] transition"
                  >
                    <Link
                      href={`/profile/${member.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0 group"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#18191c] border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center">
                        {member.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={member.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-gray-500">
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm group-hover:text-blue-400 transition truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          ID: {member.custom_id || member.random_id || tr('未分配')}
                        </p>
                      </div>
                    </Link>

                    <span className={`text-xs font-bold px-2 py-1 rounded shrink-0 ${roleBadgeOf(member.vtc_role)}`}>
                      {roleLabelOf(member.vtc_role, tr)}
                    </span>

                    {canManage && (
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={roleValue}
                          onChange={(e) => handleRoleSelect(member, e.target.value)}
                          disabled={memberBusyId !== null}
                          className="bg-[#18191c] border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="vice_owner">{tr('副队长')}</option>
                          <option value="dispatcher">{tr('调度员')}</option>
                          <option value="member">{tr('车手')}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleKick(member)}
                          disabled={memberBusyId !== null}
                          className="bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800 px-3 py-1.5 rounded text-xs font-bold transition disabled:opacity-50"
                        >
                          {memberBusyId === member.id ? tr('处理中...') : tr('踢出')}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 车队设置（仅队长可见） */}
        {isOwner && (
          <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
              <span className="text-sm font-bold text-gray-400">{tr('车队设置')}</span>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">
                    {tr('加入方式')}
                  </label>
                  <select
                    value={settingsJoinMode}
                    onChange={(e) => setSettingsJoinMode(joinModeOf(e.target.value))}
                    disabled={settingsBusy}
                    className={inputClass}
                  >
                    <option value="open">{tr('开放加入（立即加入）')}</option>
                    <option value="approval">{tr('需要申请（管理员审核）')}</option>
                    <option value="invite">{tr('仅邀请加入')}</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {tr('修改后立即对大厅的加入按钮生效。')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">
                    {tr('招募状态')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setSettingsRecruiting((value) => !value)}
                    disabled={settingsBusy}
                    className={`w-full px-4 py-3 rounded font-bold border transition disabled:opacity-50 ${
                      settingsRecruiting
                        ? 'bg-green-900/30 border-green-700 text-green-400 hover:bg-green-900/50'
                        : 'bg-red-900/30 border-red-700 text-red-400 hover:bg-red-900/50'
                    }`}
                  >
                    {settingsRecruiting
                      ? tr('招聘中（点击暂停招募）')
                      : tr('已停止招募（点击开放）')}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    {tr('关闭后申请与直接加入都会被拒绝，邀请仍然可用。')}
                  </p>
                </div>
              </div>

              <Feedback error={settingsError} success={settingsNotice} />

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={settingsBusy}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded font-bold transition shadow-lg disabled:opacity-50"
                >
                  {settingsBusy ? tr('保存中...') : tr('保存车队设置')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 危险区（仅队长可见） */}
        {isOwner && (
          <div className="bg-[#2c2d31] border border-red-900/60 rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-red-950/30 px-6 py-3 border-b border-red-900/60 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              <span className="text-sm font-bold text-red-400">{tr('危险区')}</span>
            </div>

            <div className="p-6 space-y-6">
              <Feedback error={dangerError} success={dangerNotice} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 转让车队 */}
                <div className="bg-[#232428] border border-gray-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-bold text-white">{tr('转让车队')}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {tr('将队长身份转让给本队成员，转让后你将成为普通车手。')}
                  </p>
                  {transferCandidates.length === 0 ? (
                    <p className="text-xs text-gray-500">{tr('暂无可转让的成员。')}</p>
                  ) : (
                    <>
                      <select
                        value={transferTarget}
                        onChange={(e) => setTransferTarget(e.target.value)}
                        disabled={dangerBusy}
                        className={inputClass}
                      >
                        <option value="">{tr('选择新队长...')}</option>
                        {transferCandidates.map((member) => (
                          <option key={member.id} value={member.id}>
                            {tr('{name}（{role}）', {
                              name: member.display_name || tr('未命名玩家'),
                              role: roleLabelOf(member.vtc_role, tr),
                            })}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={dangerBusy || !transferTarget}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded font-bold transition disabled:opacity-50"
                      >
                        {dangerBusy ? tr('处理中...') : tr('转让车队')}
                      </button>
                    </>
                  )}
                </div>

                {/* 解散车队 */}
                <div className="bg-[#232428] border border-red-900/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-bold text-red-400">{tr('解散车队')}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {tr('解散后车队与成员关系将无法恢复。请输入')}{' '}
                    <span className="font-mono text-red-400">DISSOLVE</span>{' '}
                    {tr('确认。')}
                  </p>
                  <input
                    type="text"
                    value={dissolveText}
                    onChange={(e) => setDissolveText(e.target.value)}
                    disabled={dangerBusy}
                    placeholder="DISSOLVE"
                    className={`${inputClass} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={handleDissolve}
                    disabled={dangerBusy || dissolveText !== 'DISSOLVE'}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded font-bold transition disabled:opacity-50"
                  >
                    {dangerBusy ? tr('处理中...') : tr('永久解散车队')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
