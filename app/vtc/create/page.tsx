// app/vtc/create/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateVTCPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // 表单状态
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  // 加入方式：open 开放加入 / approval 申请审批（默认）/ invite 仅邀请
  const [joinMode, setJoinMode] = useState<'open' | 'approval' | 'invite'>('approval');

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      
      // 检查用户是否已经有车队了
      const { data: profile } = await supabase.from('profiles').select('vtc_id').eq('id', user.id).single();
      if (profile?.vtc_id) {
        alert('🚫 你已经在车队中了，无法重复创建！');
        router.push('/vtc');
        return;
      }

      setUser(user);
      setLoading(false);
    };
    checkUser();
  }, [router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setMsg('请先登录后再创建车队。');
      return;
    }
    setSubmitting(true);
    setMsg('');

    try {
      // 1. 插入车队表
      const { data: vtcData, error: vtcError } = await supabase
        .from('vtcs')
        .insert({
          name: name.trim(),
          tag: tag.trim().toUpperCase(),
          owner_id: user.id,
          logo_url: logoUrl,
          description,
          requirements,
          is_recruiting: true,
          join_mode: joinMode
        })
        .select()
        .single();

      if (vtcError) throw vtcError;

      // 2. 更新用户资料，绑定车队
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          vtc_id: vtcData.id,
          vtc_role: 'owner' 
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // 3. 成功，跳转到 VTC 大厅
      alert('🎉 车队创建成功！');
      router.push('/vtc');
      router.refresh();

    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'message' in error
        ? (error as { message?: unknown }).message
        : null;
      setMsg(`创建失败：${typeof message === 'string' && message.trim() ? message : '操作失败，请稍后重试'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">检查权限中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      {/* 顶部横幅 */}
      <div className="w-full h-40 relative bg-[url('https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-black/70"></div>
        <div className="absolute inset-0 flex flex-col justify-center max-w-4xl mx-auto w-full px-4 md:px-8">
          <Link href="/vtc" className="text-blue-300 hover:text-white transition text-sm mb-2 inline-block w-max font-bold">
            ← 返回车队大厅
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg">创建虚拟车队 (VTC)</h1>
        </div>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 -mt-6 relative z-10">
        <form onSubmit={handleCreate} className="bg-[#2c2d31] border border-gray-700 p-6 md:p-8 rounded-lg shadow-2xl space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-400 mb-2">车队全名 *</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
                placeholder="例如：Road Cruise Transport"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">车队标签 (Tag)</label>
              <input 
                type="text" 
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                maxLength={5}
                className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white uppercase focus:outline-none focus:border-blue-500"
                placeholder="例如：RCT (最多5字)"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">车队 Logo 链接 (选填)</label>
            <input 
              type="url" 
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="https://i.imgur.com/xxxxx.jpg"
            />
            <p className="text-xs text-gray-500 mt-1">建议使用正方形图片（如 256x256）</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">加入方式 *</label>
            <select
              value={joinMode}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'open' || value === 'approval' || value === 'invite') {
                  setJoinMode(value);
                }
              }}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="open">开放加入（玩家点击立即加入）</option>
              <option value="approval">需要申请（队长/副队长审核）</option>
              <option value="invite">仅邀请加入（只能由管理层邀请）</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">默认需要申请；创建后也可以在车队详情里修改。</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">车队简介 *</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-32 focus:outline-none focus:border-blue-500"
              placeholder="向大家介绍一下你们的车队吧..."
              required
            ></textarea>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">招募要求 (选填)</label>
            <textarea 
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-24 focus:outline-none focus:border-blue-500"
              placeholder="例如：需要拥有正版游戏、有麦克风、每月至少参与一次联运等..."
            ></textarea>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            {msg && <p className="text-red-400 font-bold text-sm">{msg}</p>}
            <button 
              type="submit" 
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded font-bold transition shadow-lg ml-auto disabled:opacity-50"
            >
              {submitting ? '正在建立...' : '提交并创建车队'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}