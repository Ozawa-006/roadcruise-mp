// app/privacy/page.tsx
'use client';

import Navbar from '../../components/Navbar';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-10">
        <h1 className="text-3xl font-bold text-white mb-2">隐私政策 (Privacy Policy)</h1>
        <p className="text-sm text-gray-500 mb-8 pb-4 border-b border-gray-700">
          最后更新日期：2026年11月1日
        </p>

        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-6 md:p-8 shadow-lg space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">1. 我们收集的信息</h2>
            <p>当您注册成为 Road Cruise Transport MP (以下简称“本社区”) 的成员时，我们会收集以下信息：</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
              <li><strong>账号信息：</strong> 您的邮箱地址和加密后的密码。</li>
              <li><strong>游戏信息：</strong> 通过 Steam API 获取的 Steam ID、游戏库所有权及游戏时长（仅用于验证是否拥有正版游戏）。</li>
              <li><strong>资料信息：</strong> 您在社区填写的昵称、个人简介、社交媒体链接及上传的头像。</li>
              <li><strong>日志信息：</strong> 您的 IP 地址及浏览器类型（用于系统安全审计和防止恶意攻击）。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">2. 我们如何使用您的信息</h2>
            <p>我们收集信息仅用于以下目的：</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
              <li>验证您的身份并管理您的社区账号。</li>
              <li>确认您拥有《欧洲卡车模拟2》正版游戏，以维护游戏环境的公平。</li>
              <li>在论坛中展示您的公开资料（如头像、昵称、职位）。</li>
              <li>发送重要通知（如密码重置、活动公告）。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">3. 数据安全与第三方服务</h2>
            <p>我们非常重视您的数据安全。您的密码是加密存储的，我们无法查看明文。</p>
            <p className="mt-2">本社区依赖以下第三方服务来维持运行：</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
              <li><strong>Supabase：</strong> 用于存储账户数据库和图片文件。</li>
              <li><strong>Vercel：</strong> 用于托管本网站。</li>
              <li><strong>Steam：</strong> 用于账号绑定与验证。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">4. 您的权利</h2>
            <p>您有权随时在“账号设置”中修改您的个人资料，或联系我们要求删除您的全部账号及数据。账号删除后，您的论坛发帖将保留但会显示为“已注销用户”。</p>
          </section>
        </div>
        
        <div className="mt-8 text-center text-sm">
          <Link href="/" className="text-blue-400 hover:text-white transition">← 返回主页</Link>
        </div>
      </div>
    </main>
  );
}