// app/vtc/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { useTr } from '@/components/I18nProvider';

// 英文文案：键为中文原文，缺失时回退中文。
const EN: Record<string, string> = {
  // —— 页面头部 ——
  'VTC 虚拟车队大厅': 'VTC Virtual Fleet Lobby',
  '寻找属于你的车队，或者创建你自己的运输帝国。':
    'Find the fleet that fits you, or build your own transport empire.',
  '创建车队': 'Create a VTC',
  '登录以创建车队': 'Sign in to create a VTC',
  '你已加入车队，前往': 'You are already in a VTC. Go to',
  '个人中心': 'your profile',
  '查看我的车队。': 'to view your fleet.',
  // —— 操作提示 ——
  '加载车队失败：{error}': 'Failed to load VTCs: {error}',
  '加入失败：{error}': 'Failed to join: {error}',
  '申请失败：{error}': 'Failed to apply: {error}',
  '取消失败：{error}': 'Failed to cancel: {error}',
  '接受邀请失败：{error}': 'Failed to accept the invitation: {error}',
  '拒绝邀请失败：{error}': 'Failed to decline the invitation: {error}',
  '🎉 成功加入车队！': '🎉 Successfully joined the VTC!',
  '申请已提交，请等待车队审核。':
    'Application submitted. Please wait for the VTC to review it.',
  '已取消加入申请。': 'Application cancelled.',
  '已接受邀请，欢迎加入车队！': 'Invitation accepted. Welcome to the VTC!',
  '已拒绝该邀请。': 'Invitation declined.',
  // —— 加载 / 空状态 ——
  '加载车队数据中...': 'Loading VTC data...',
  '操作失败，请稍后重试': 'Something went wrong. Please try again later.',
  '目前还没有车队': 'No VTCs yet',
  '成为第一个创立车队的先驱者吧！': 'Be the first to create one!',
  '立即创建': 'Create now',
  // —— 车队卡片 ——
  '开放加入': 'Open to join',
  '需申请': 'Approval required',
  '仅邀请': 'Invite only',
  '这个车队还没有填写简介。': 'This VTC has not added a description yet.',
  '{count} 名成员': '{count} members',
  '招聘中': 'Recruiting',
  '已停止招募': 'Recruitment closed',
  '我的车队': 'My VTC',
  '进入车队': 'View VTC',
  '你有邀请': 'You have an invitation',
  '处理中...': 'Processing...',
  '接受': 'Accept',
  '拒绝': 'Decline',
  '审核中': 'Under review',
  '取消中...': 'Cancelling...',
  '取消申请': 'Cancel application',
  '你已有一条待审核申请': 'You already have a pending application',
  '申请留言（选填）：介绍一下你的在线时间 / 驾驶经验...':
    'Application note (optional): tell us about your online hours / driving experience...',
  '提交中...': 'Submitting...',
  '提交申请': 'Submit application',
  '取消': 'Cancel',
  '加入中...': 'Joining...',
  '立即加入': 'Join now',
  '申请加入': 'Apply to join',
  '仅邀请加入': 'Invite only',
  '登录后才能加入车队': 'Sign in to join a VTC',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type JoinMode = 'open' | 'approval' | 'invite';

interface LobbyVtc {
  id: number;
  name: string;
  tag: string | null;
  logo_url: string | null;
  description: string | null;
  is_recruiting: boolean | null;
  join_mode: string | null;
  created_at: string | null;
  profiles?: { count: number }[] | null;
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

// 兼容历史数据：join_mode 缺失或非法时按“申请审批”处理
function joinModeOf(mode: string | null | undefined): JoinMode {
  if (mode === 'open' || mode === 'invite') return mode;
  return 'approval';
}

// 统一把 Supabase / 未知异常转成中文错误文案
function rpcErrorText(error: unknown, tr: (zh: string) => string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return tr('操作失败，请稍后重试');
}

export default function VTCHome() {
  const tr = useTr(EN);
  const router = useRouter();

  const [vtcs, setVtcs] = useState<LobbyVtc[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [userVtcId, setUserVtcId] = useState<number | null>(null);

  // 我的待处理申请 / 邀请
  const [pendingApp, setPendingApp] = useState<PendingApplication | null>(null);
  const [invites, setInvites] = useState<PendingInvitation[]>([]);

  // 操作状态（busyKey 防止重复点击）
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ key: string; text: string } | null>(null);
  const [notice, setNotice] = useState('');

  // 内联申请表单
  const [applyVtcId, setApplyVtcId] = useState<number | null>(null);
  const [applyMessage, setApplyMessage] = useState('');

  const loadData = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    setActionError(null);

    try {
      // 1. 当前用户 & 我的车队归属
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser ? { id: currentUser.id } : null);

      let currentVtcId: number | null = null;
      if (currentUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('vtc_id')
          .eq('id', currentUser.id)
          .maybeSingle();
        currentVtcId = (profile as { vtc_id: number | null } | null)?.vtc_id ?? null;
      }
      setUserVtcId(currentVtcId);

      // 2. 待处理申请 / 邀请（仅未加入车队的登录用户）
      let app: PendingApplication | null = null;
      let pendingInvites: PendingInvitation[] = [];

      if (currentUser && currentVtcId === null) {
        const { data: appData, error: appError } = await supabase
          .from('vtc_applications')
          .select('id, vtc_id, status')
          .eq('user_id', currentUser.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (appError) {
          console.error('获取申请状态失败:', appError);
        } else if (appData) {
          app = appData as unknown as PendingApplication;
        }

        const { data: inviteData, error: inviteError } = await supabase
          .from('vtc_invitations')
          .select('id, vtc_id, status')
          .eq('invited_user_id', currentUser.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (inviteError) {
          console.error('获取邀请失败:', inviteError);
        } else if (inviteData) {
          pendingInvites = inviteData as unknown as PendingInvitation[];
        }
      }
      setPendingApp(app);
      setInvites(pendingInvites);

      // 3. 车队列表 + 成员数
      const { data: vtcData, error: vtcError } = await supabase
        .from('vtcs')
        .select(`
          *,
          profiles!vtc_id(count)
        `)
        .order('created_at', { ascending: false });

      if (vtcError) {
        throw vtcError;
      }
      setVtcs((vtcData ?? []) as unknown as LobbyVtc[]);
    } catch (error: unknown) {
      setActionError({
        key: 'load',
        text: tr('加载车队失败：{error}', { error: rpcErrorText(error, tr) }),
      });
    } finally {
      setLoading(false);
    }
    // tr 每次渲染都会重新创建，加入依赖会导致重复请求；语言切换由 Provider 刷新页面处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 在 effect 内启动请求，setState 只发生在 await 之后，不做同步级联更新
    (async () => {
      await loadData(true);
    })();
  }, [loadData]);

  // 开放加入
  const handleJoinOpen = async (vtc: LobbyVtc) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setBusyKey(`open-${vtc.id}`);
    setActionError(null);
    setNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_join_open', { p_vtc_id: vtc.id });
      if (error) throw error;
      setNotice(tr('🎉 成功加入车队！'));
      await loadData(false);
    } catch (error: unknown) {
      setActionError({
        key: `card-${vtc.id}`,
        text: tr('加入失败：{error}', { error: rpcErrorText(error, tr) }),
      });
    } finally {
      setBusyKey(null);
    }
  };

  // 打开/关闭内联申请表单
  const handleApplyClick = (vtc: LobbyVtc) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setActionError(null);
    setNotice('');
    setApplyVtcId((prev) => (prev === vtc.id ? null : vtc.id));
    setApplyMessage('');
  };

  // 提交申请
  const handleSubmitApplication = async (e: React.FormEvent, vtc: LobbyVtc) => {
    e.preventDefault();
    setBusyKey(`apply-${vtc.id}`);
    setActionError(null);
    setNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_apply', {
        p_vtc_id: vtc.id,
        p_message: applyMessage.trim(),
      });
      if (error) throw error;
      setApplyVtcId(null);
      setApplyMessage('');
      setNotice(tr('申请已提交，请等待车队审核。'));
      await loadData(false);
    } catch (error: unknown) {
      setActionError({
        key: `card-${vtc.id}`,
        text: tr('申请失败：{error}', { error: rpcErrorText(error, tr) }),
      });
    } finally {
      setBusyKey(null);
    }
  };

  // 取消自己的待审核申请
  const handleCancelApplication = async (vtc: LobbyVtc) => {
    if (!pendingApp || pendingApp.vtc_id !== vtc.id) return;
    setBusyKey(`cancel-${vtc.id}`);
    setActionError(null);
    setNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_cancel_application', {
        p_id: pendingApp.id,
      });
      if (error) throw error;
      setNotice(tr('已取消加入申请。'));
      await loadData(false);
    } catch (error: unknown) {
      setActionError({
        key: `card-${vtc.id}`,
        text: tr('取消失败：{error}', { error: rpcErrorText(error, tr) }),
      });
    } finally {
      setBusyKey(null);
    }
  };

  // 接受 / 拒绝邀请
  const handleRespondInvite = async (invite: PendingInvitation, accept: boolean) => {
    setBusyKey(`invite-${invite.id}`);
    setActionError(null);
    setNotice('');

    try {
      const { error } = await supabase.rpc('rct_vtc_respond_invite', {
        p_id: invite.id,
        p_accept: accept,
      });
      if (error) throw error;
      setNotice(tr(accept ? '已接受邀请，欢迎加入车队！' : '已拒绝该邀请。'));
      await loadData(false);
    } catch (error: unknown) {
      setActionError({
        key: `card-${invite.vtc_id}`,
        text: tr(accept ? '接受邀请失败：{error}' : '拒绝邀请失败：{error}', {
          error: rpcErrorText(error, tr),
        }),
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">
        {tr('加载车队数据中...')}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">

        {/* 头部区域 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-gray-700 pb-4 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="w-2 h-8 bg-blue-500 inline-block rounded-sm"></span>
              {tr('VTC 虚拟车队大厅')}
            </h1>
            <p className="text-gray-400 text-sm">
              {tr('寻找属于你的车队，或者创建你自己的运输帝国。')}
            </p>
          </div>

          {/* 只有没加入车队的用户才能看到创建按钮 */}
          {user && !userVtcId && (
            <Link
              href="/vtc/create"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg flex items-center gap-2"
            >
              <span className="text-xl">+</span> {tr('创建车队')}
            </Link>
          )}
          {!user && (
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg"
            >
              {tr('登录以创建车队')}
            </Link>
          )}
          {user && userVtcId && (
            <div className="bg-[#2c2d31] px-4 py-2 rounded-lg border border-gray-600 text-sm">
              {tr('你已加入车队，前往')}{' '}
              <Link href="/profile" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 mx-1">
                {tr('个人中心')}
              </Link>{' '}
              {tr('查看我的车队。')}
            </div>
          )}
        </div>

        {/* 操作提示 */}
        {(notice || (actionError && actionError.key === 'load')) && (
          <div className="space-y-2 mb-6">
            {notice && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded text-sm font-bold">
                {notice}
              </div>
            )}
            {actionError && actionError.key === 'load' && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded text-sm font-bold">
                {actionError.text}
              </div>
            )}
          </div>
        )}

        {/* 车队列表网格 */}
        {vtcs.length === 0 ? (
          <div className="text-center py-20 bg-[#2c2d31] rounded-lg border border-gray-700 border-dashed">
            <p className="text-4xl mb-4">🚛</p>
            <h2 className="text-xl text-white font-bold mb-2">{tr('目前还没有车队')}</h2>
            <p className="text-gray-500 mb-6">{tr('成为第一个创立车队的先驱者吧！')}</p>
            {user && (
              <Link href="/vtc/create" className="bg-blue-600 text-white px-6 py-2 rounded font-bold">
                {tr('立即创建')}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vtcs.map((vtc) => {
              // 获取人数（Supabase 联表 count 返回的是一个数组，里面有一个 count 字段）
              const memberCount = vtc.profiles?.[0]?.count || 0;
              const mode = joinModeOf(vtc.join_mode);
              const recruiting = vtc.is_recruiting !== false;
              const isBusy = busyKey !== null;
              const myInvite = invites.find((invite) => invite.vtc_id === vtc.id) ?? null;
              const pendingForThis = pendingApp && pendingApp.vtc_id === vtc.id ? pendingApp : null;
              const hasOtherPending = pendingApp !== null && pendingApp.vtc_id !== vtc.id;
              const cardError = actionError?.key === `card-${vtc.id}` ? actionError.text : null;
              const isMyTeam = userVtcId === vtc.id;

              return (
                <div
                  key={vtc.id}
                  className="bg-[#2c2d31] rounded-xl border border-gray-700 shadow-lg hover:border-blue-500 transition group overflow-hidden flex flex-col"
                >
                  {/* Logo 和名字 */}
                  <Link href={`/vtc/${vtc.id}`} className="p-6 flex items-center gap-5 border-b border-gray-700/50">
                    <div className="w-20 h-20 bg-[#18191c] rounded-lg border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center shadow-md">
                      {vtc.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={vtc.logo_url} alt={vtc.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl">🏢</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-white group-hover:text-blue-400 transition mb-1 line-clamp-1">
                        {vtc.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {vtc.tag && (
                          <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded font-mono border border-blue-800">
                            [{vtc.tag}]
                          </span>
                        )}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${JOIN_MODE_BADGES[mode]}`}>
                          {tr(JOIN_MODE_LABELS[mode])}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* 简介 */}
                  <div className="p-6 flex-1">
                    <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">
                      {vtc.description || tr('这个车队还没有填写简介。')}
                    </p>
                  </div>

                  {/* 底部信息 */}
                  <div className="px-6 py-4 bg-[#232428] border-t border-gray-700/50 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                      <span className="text-gray-400 font-bold">
                        {tr('{count} 名成员', { count: memberCount })}
                      </span>
                    </div>
                    {recruiting ? (
                      <span className="text-green-500 font-bold bg-green-900/20 px-2 py-1 rounded">
                        {tr('招聘中')}
                      </span>
                    ) : (
                      <span className="text-red-500 font-bold bg-red-900/20 px-2 py-1 rounded">
                        {tr('已停止招募')}
                      </span>
                    )}
                  </div>

                  {/* 加入 / 进入操作区 */}
                  <div className="px-6 py-4 border-t border-gray-700/50 flex flex-wrap items-center gap-2 min-h-[64px]">
                    {userVtcId !== null ? (
                      <Link
                        href={`/vtc/${vtc.id}`}
                        className={`px-4 py-2 rounded text-sm font-bold transition ${
                          isMyTeam
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-[#18191c] border border-gray-600 text-gray-300 hover:text-white hover:border-blue-500'
                        }`}
                      >
                        {isMyTeam ? tr('我的车队') : tr('进入车队')}
                      </Link>
                    ) : (
                      <>
                        {myInvite && (
                          <div className="flex flex-wrap items-center gap-2 w-full">
                            <span className="text-xs font-bold text-yellow-400 bg-yellow-900/20 border border-yellow-800 px-2 py-1 rounded">
                              {tr('你有邀请')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRespondInvite(myInvite, true)}
                              disabled={isBusy}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                            >
                              {busyKey === `invite-${myInvite.id}` ? tr('处理中...') : tr('接受')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespondInvite(myInvite, false)}
                              disabled={isBusy}
                              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                            >
                              {tr('拒绝')}
                            </button>
                          </div>
                        )}

                        {pendingForThis ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-yellow-400 bg-yellow-900/20 border border-yellow-800 px-2 py-1.5 rounded">
                              {tr('审核中')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCancelApplication(vtc)}
                              disabled={isBusy}
                              className="bg-[#18191c] border border-gray-600 hover:border-red-500 hover:text-red-400 text-gray-300 px-3 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                            >
                              {busyKey === `cancel-${vtc.id}` ? tr('取消中...') : tr('取消申请')}
                            </button>
                          </div>
                        ) : hasOtherPending ? (
                          <span className="text-xs text-gray-500 font-bold bg-[#18191c] px-3 py-2 rounded border border-gray-700">
                            {tr('你已有一条待审核申请')}
                          </span>
                        ) : applyVtcId === vtc.id ? (
                          <form onSubmit={(e) => handleSubmitApplication(e, vtc)} className="w-full space-y-2">
                            <textarea
                              value={applyMessage}
                              onChange={(e) => setApplyMessage(e.target.value)}
                              maxLength={300}
                              rows={3}
                              placeholder={tr('申请留言（选填）：介绍一下你的在线时间 / 驾驶经验...')}
                              className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="submit"
                                disabled={isBusy}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-bold transition disabled:opacity-50"
                              >
                                {busyKey === `apply-${vtc.id}` ? tr('提交中...') : tr('提交申请')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setApplyVtcId(null)}
                                disabled={isBusy}
                                className="text-gray-400 hover:text-white text-sm font-bold disabled:opacity-50"
                              >
                                {tr('取消')}
                              </button>
                            </div>
                          </form>
                        ) : mode === 'open' ? (
                          <button
                            type="button"
                            onClick={() => handleJoinOpen(vtc)}
                            disabled={isBusy || !recruiting}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold transition disabled:opacity-50"
                          >
                            {busyKey === `open-${vtc.id}`
                              ? tr('加入中...')
                              : recruiting
                                ? tr('立即加入')
                                : tr('已停止招募')}
                          </button>
                        ) : mode === 'approval' ? (
                          <button
                            type="button"
                            onClick={() => handleApplyClick(vtc)}
                            disabled={isBusy || !recruiting}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold transition disabled:opacity-50"
                          >
                            {recruiting ? tr('申请加入') : tr('已停止招募')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="bg-[#18191c] border border-gray-700 text-gray-500 px-4 py-2 rounded text-sm font-bold cursor-not-allowed"
                          >
                            {tr('仅邀请加入')}
                          </button>
                        )}

                        {!user && (
                          <span className="text-xs text-gray-500 ml-auto">
                            {tr('登录后才能加入车队')}
                          </span>
                        )}
                      </>
                    )}

                    {cardError && (
                      <p className="w-full text-xs text-red-400 font-bold">{cardError}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}
