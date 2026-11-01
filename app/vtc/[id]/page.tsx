// app/vtc/[id]/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Vtc {
  id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  description: string | null;
  requirements: string | null;
  is_recruiting: boolean | null;
  owner_id: string | null;
  created_at: string | null;
}

interface VtcMember {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  vtc_role: string | null;
  custom_id: string | null;
  random_id: string | null;
}

interface VtcForm {
  name: string;
  tag: string;
  logo_url: string;
  description: string;
  requirements: string;
  is_recruiting: boolean;
}

// 车队内部职位的中文标签
const VTC_ROLE_LABELS: Record<string, string> = {
  owner: '队长',
  manager: '管理',
  member: '成员',
};

export default function VTCDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vtcId = params?.id as string;

  const [vtc, setVtc] = useState<Vtc | null>(null);
  const [members, setMembers] = useState<VtcMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 当前登录用户 & 其车队归属
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [myVtcId, setMyVtcId] = useState<string | null>(null);

  // 操作状态
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // 编辑表单
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VtcForm>({
    name: '',
    tag: '',
    logo_url: '',
    description: '',
    requirements: '',
    is_recruiting: true,
  });

  // 1. 读取车队信息 + 成员列表 + 当前用户归属
  const fetchData = useCallback(async () => {
    if (!vtcId) return;
    setLoading(true);
    setErrMsg('');
    setNotFound(false);

    // 当前用户（未登录时为 null，不影响页面浏览）
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser ? { id: currentUser.id } : null);

    if (currentUser) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('vtc_id')
        .eq('id', currentUser.id)
        .maybeSingle();
      setMyVtcId((myProfile?.vtc_id as string | null) ?? null);
    } else {
      setMyVtcId(null);
    }

    // 车队主体信息
    const { data: vtcData, error: vtcError } = await supabase
      .from('vtcs')
      .select('*')
      .eq('id', vtcId)
      .maybeSingle();

    if (vtcError) {
      console.error('获取车队信息失败:', vtcError);
      setErrMsg(`加载车队信息失败：${vtcError.message}`);
      setLoading(false);
      return;
    }

    if (!vtcData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = vtcData as Vtc;
    setVtc(row);
    setForm({
      name: row.name || '',
      tag: row.tag || '',
      logo_url: row.logo_url || '',
      description: row.description || '',
      requirements: row.requirements || '',
      is_recruiting: row.is_recruiting ?? true,
    });

    // 成员列表
    const { data: membersData, error: membersError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, vtc_role, custom_id, random_id')
      .eq('vtc_id', vtcId);

    if (membersError) {
      console.error('获取成员列表失败:', membersError);
      setErrMsg(`加载成员列表失败：${membersError.message}`);
    } else if (membersData) {
      // owner 排最前，其次 manager，最后 member
      const weight: Record<string, number> = { owner: 0, manager: 1, member: 2 };
      setMembers(
        ([...membersData] as VtcMember[]).sort(
          (a, b) => (weight[a.vtc_role ?? ''] ?? 9) - (weight[b.vtc_role ?? ''] ?? 9)
        )
      );
    }

    setLoading(false);
  }, [vtcId]);

  useEffect(() => {
    // 在 effect 内启动请求，setState 只发生在 await 之后，不做同步级联更新
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  // 2. 加入车队（仅未加入任何车队时可加入，且车队在招募中）
  const handleJoin = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (myVtcId) {
      setErrMsg('你已经加入了其他车队，请先退出原车队。');
      return;
    }
    setActing(true);
    setErrMsg('');
    setMsg('');

    const { error } = await supabase
      .from('profiles')
      .update({ vtc_id: vtcId, vtc_role: 'member' })
      .eq('id', user.id);

    if (error) {
      setErrMsg(`加入失败：${error.message}`);
    } else {
      setMsg('🎉 成功加入车队！');
      await fetchData();
    }
    setActing(false);
  };

  // 3. 退出车队（队长不可退出，需先转让/解散）
  const handleLeave = async () => {
    if (!user) return;
    setActing(true);
    setErrMsg('');
    setMsg('');

    const { error } = await supabase
      .from('profiles')
      .update({ vtc_id: null, vtc_role: null })
      .eq('id', user.id);

    if (error) {
      setErrMsg(`退出失败：${error.message}`);
    } else {
      setMsg('你已退出该车队。');
      await fetchData();
    }
    setActing(false);
  };

  // 4. 保存编辑（仅队长）
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vtc) return;
    setActing(true);
    setErrMsg('');
    setMsg('');

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

    if (error) {
      setErrMsg(`保存失败：${error.message}`);
    } else {
      setMsg('✅ 车队信息已更新。');
      setEditing(false);
      await fetchData();
    }
    setActing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">
        加载车队信息中...
      </div>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 flex flex-col justify-center items-center gap-4">
          <p className="text-4xl">🚛</p>
          <h1 className="text-xl font-bold text-white">车队不存在</h1>
          <p className="text-sm text-gray-500">该车队可能已被解散，或链接有误。</p>
          <Link href="/vtc" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold transition">
            返回车队大厅
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = !!user && !!vtc && vtc.owner_id === user.id;
  const isMember = !!user && !!vtc && myVtcId === vtc.id;
  const inOtherVtc = !!user && !!myVtcId && myVtcId !== vtc?.id;
  const canJoin = !!user && !myVtcId && vtc?.is_recruiting !== false;

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
            <Link href="/vtc" className="hover:text-white transition">车队大厅</Link>
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
        {(msg || errMsg) && (
          <div className="space-y-2">
            {msg && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded text-sm font-bold">
                {msg}
              </div>
            )}
            {errMsg && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded text-sm font-bold">
                {errMsg}
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
                {vtc?.is_recruiting ? (
                  <span className="text-xs text-green-500 font-bold bg-green-900/20 px-2 py-1 rounded">招聘中</span>
                ) : (
                  <span className="text-xs text-red-500 font-bold bg-red-900/20 px-2 py-1 rounded">已停止招募</span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                <span>{members.length} 名成员</span>
                {vtc?.created_at && (
                  <span>创建于 {new Date(vtc.created_at).toLocaleDateString()}</span>
                )}
              </div>

              <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                {vtc?.description || '这个车队还没有填写简介。'}
              </p>
            </div>
          </div>

          {vtc?.requirements && (
            <div className="px-6 pb-6">
              <div className="bg-[#232428] border border-gray-700 rounded-lg p-4">
                <h3 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">招募要求</h3>
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
                登录后加入车队
              </Link>
            )}

            {canJoin && (
              <button
                onClick={handleJoin}
                disabled={acting}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg disabled:opacity-50"
              >
                {acting ? '处理中...' : '加入车队'}
              </button>
            )}

            {user && !myVtcId && !canJoin && (
              <span className="text-sm text-gray-500 font-bold bg-[#18191c] px-4 py-2.5 rounded border border-gray-700">
                该车队已停止招募
              </span>
            )}

            {inOtherVtc && (
              <span className="text-sm text-yellow-400 font-bold bg-yellow-900/20 px-4 py-2.5 rounded border border-yellow-800">
                你已加入其他车队，需先退出才能加入
              </span>
            )}

            {isOwner && (
              <>
                <button
                  onClick={() => setEditing(v => !v)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg"
                >
                  {editing ? '取消编辑' : '编辑车队信息'}
                </button>
                <span className="text-sm text-gray-500 font-bold bg-[#18191c] px-4 py-2.5 rounded border border-gray-700">
                  你是该车队的队长
                </span>
              </>
            )}

            {/* 成员（非队长）可以退出 */}
            {isMember && !isOwner && (
              <button
                onClick={handleLeave}
                disabled={acting}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded font-bold transition shadow-lg disabled:opacity-50"
              >
                {acting ? '处理中...' : '退出车队'}
              </button>
            )}

            <Link
              href="/vtc"
              className="ml-auto text-sm text-gray-400 hover:text-white transition font-bold"
            >
              ← 返回大厅
            </Link>
          </div>
        </div>

        {/* 编辑表单（仅队长可见） */}
        {isOwner && editing && (
          <form
            onSubmit={handleSave}
            className="bg-[#2c2d31] border border-gray-700 p-6 md:p-8 rounded-xl shadow-2xl space-y-6"
          >
            <h2 className="text-lg font-bold text-white border-b border-gray-700 pb-3">编辑车队信息</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-400 mb-2">车队全名 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">车队标签 (Tag)</label>
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
              <label className="block text-sm font-bold text-gray-400 mb-2">车队 Logo 链接</label>
              <input
                type="url"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                className={inputClass}
                placeholder="https://i.imgur.com/xxxxx.jpg"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">车队简介 *</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={`${inputClass} h-32`}
                required
              ></textarea>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">招募要求</label>
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
                <span className="text-sm text-gray-300 font-bold">开放招募</span>
              </label>

              <button
                type="submit"
                disabled={acting}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded font-bold transition shadow-lg disabled:opacity-50"
              >
                {acting ? '保存中...' : '保存修改'}
              </button>
            </div>
          </form>
        )}

        {/* 成员列表 */}
        <div className="bg-[#2c2d31] border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-[#232428] px-6 py-3 border-b border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
              <span className="text-sm font-bold text-gray-400">车队成员</span>
            </div>
            <span className="text-xs text-gray-500">共 {members.length} 人</span>
          </div>

          {members.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-12">
              这个车队还没有成员。
            </div>
          ) : (
            <ul className="divide-y divide-gray-700/60">
              {members.map((m) => {
                const displayName = m.display_name || '未命名玩家';
                const roleLabel = VTC_ROLE_LABELS[m.vtc_role ?? ''] || '成员';
                return (
                  <li key={m.id}>
                    <Link
                      href={`/profile/${m.id}`}
                      className="flex items-center gap-4 px-6 py-3 hover:bg-[#232428] transition group"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#18191c] border border-gray-600 overflow-hidden shrink-0 flex items-center justify-center">
                        {m.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatar_url} alt={displayName} className="w-full h-full object-cover" />
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
                          ID: {m.custom_id || m.random_id || '未分配'}
                        </p>
                      </div>

                      <span
                        className={`text-xs font-bold px-2 py-1 rounded shrink-0 ${
                          m.vtc_role === 'owner'
                            ? 'bg-red-900/30 text-red-400 border border-red-800'
                            : m.vtc_role === 'manager'
                            ? 'bg-blue-900/30 text-blue-400 border border-blue-800'
                            : 'bg-gray-700/40 text-gray-400 border border-gray-600'
                        }`}
                      >
                        {roleLabel}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
