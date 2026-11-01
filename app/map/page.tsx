'use client';

import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 🌟 模拟的在线玩家（假数据，到时候换成真实的 WebSocket 推送坐标）
const MOCK_PLAYERS = [
  { id: 1, name: 'CRT', x: 45, y: 55, color: 'bg-blue-500', speed: '85 km/h' },
  { id: 2, name: 'Xiao ze', x: 60, y: 40, color: 'bg-green-500', speed: '78 km/h' },
  { id: 3, name: 'Logistics_01', x: 30, y: 70, color: 'bg-red-500', speed: '92 km/h' },
];

export default function MapPage() {
  // 用一个定时器让速度数字随机跳动，制造“实时感”
  const [players, setPlayers] = useState(MOCK_PLAYERS);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlayers(prev => prev.map(p => ({
        ...p,
        speed: `${Math.floor(75 + Math.random() * 20)} km/h`
      })));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="h-screen bg-[#111] flex flex-col overflow-hidden font-sans text-white">
      <Navbar />

      {/* 演示数据提示：地图与玩家位置目前都是模拟的 */}
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs leading-5 text-amber-200">
        <span className="mr-2 inline-flex items-center rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
          演示数据 · Mock Data
        </span>
        当前地图与玩家位置均为模拟数据，仅用于界面预览；遥测接口接入后将替换为真实数据。
      </div>
      
      <div className="flex-1 relative flex">
        {/* 左侧控制面板 */}
        <div className="w-80 bg-[#1a1a1a] border-r border-gray-800 z-10 flex flex-col shadow-2xl">
          <div className="p-6 border-b border-gray-800">
            <h1 className="text-2xl font-black text-white tracking-wide">📡 实时地图</h1>
            <p className="text-xs text-gray-500 mt-1">Simulation 1 | 在线人数: {players.length}</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {players.map(p => (
              <div key={p.id} className="bg-[#2c2d31] p-4 rounded-lg border border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${p.color} animate-pulse`}></div>
                  <span className="font-bold text-sm">{p.name}</span>
                </div>
                <span className="text-xs text-gray-400 font-mono">{p.speed}</span>
              </div>
            ))}
          </div>
          
          <div className="p-4 bg-[#232428] text-center text-xs text-gray-500 border-t border-gray-800">
            仅供预览 | 遥测系统开发中...
          </div>
        </div>

        {/* 右侧地图区域 (用一张欧卡地图网图作为背景) */}
        <div 
          className="flex-1 relative bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Europe_relief_laea_location_map.jpg/1200px-Europe_relief_laea_location_map.jpg')] bg-cover bg-center opacity-80"
        >
          {/* 铺一层黑色半透明遮罩，防止地图太亮刺眼 */}
          <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>

          {/* 🌟 循环渲染玩家在地图上的位置 */}
          {players.map(p => (
            <div 
              key={p.id} 
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-1000 ease-in-out"
              style={{ 
                top: `${p.y}%`, 
                left: `${p.x}%`,
                backgroundColor: p.color === 'bg-blue-500' ? '#3b82f6' : p.color === 'bg-green-500' ? '#22c55e' : '#ef4444'
              }}
              title={p.name}
            >
              {/* 玩家名字标签 */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                {p.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}