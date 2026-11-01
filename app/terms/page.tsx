// app/terms/page.tsx
'use client';

import Navbar from '../../components/Navbar';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-10">
        <h1 className="text-3xl font-bold text-white mb-2">服务条款 (Terms of Service)</h1>
        <p className="text-sm text-gray-500 mb-8 pb-4 border-b border-gray-700">
          最后更新日期：2026年11月1日
        </p>

        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-6 md:p-8 shadow-lg space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">1. 服务说明</h2>
            <p>Road Cruise Transport MP 是一个由玩家自发组织的非盈利性《欧洲卡车模拟2》虚拟车队与交流社区。我们提供论坛交流、Steam 账号验证、以及联机活动组织等服务。我们与游戏开发商 SCS Software 无任何隶属关系。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">2. 账号责任</h2>
            <p>您必须妥善保管您的账号密码。任何通过您的账号进行的操作，均视为您本人的行为。严禁将账号出借、出售给他人。若发现账号被盗，请立即通过邮箱重置密码或联系管理员。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">3. 免责声明</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
              <li>本社区为非盈利性质，我们不保证服务器 100% 在线，因服务器维护或不可抗力导致的服务中断，我们不承担赔偿责任。</li>
              <li>论坛中用户发表的内容仅代表用户个人观点，不代表本社区立场。</li>
              <li>因玩家个人电脑故障、游戏崩溃、或使用第三方违规模组导致的游戏数据丢失，本社区概不负责。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">4. 服务变更与终止</h2>
            <p>我们保留随时修改、暂停或终止本社区全部或部分服务的权利。如果发现用户严重违反《行为准则》，我们有权在不事先通知的情况下永久封禁该用户及其关联的 Steam 账号。</p>
          </section>
        </div>
        
        <div className="mt-8 text-center text-sm">
          <Link href="/" className="text-blue-400 hover:text-white transition">← 返回主页</Link>
        </div>
      </div>
    </main>
  );
}