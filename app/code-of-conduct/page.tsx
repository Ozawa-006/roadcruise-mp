// app/code-of-conduct/page.tsx
'use client';

import Navbar from '../../components/Navbar';
import Link from 'next/link';

export default function CodeOfConductPage() {
  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-10">
        <h1 className="text-3xl font-bold text-white mb-2">行为准则 (Code of Conduct)</h1>
        <p className="text-sm text-gray-500 mb-8 pb-4 border-b border-gray-700">
          最后更新日期：2026年11月1日
        </p>

        <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-6 md:p-8 shadow-lg space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">1. 尊重与包容</h2>
            <p>本社区欢迎所有热爱卡车的玩家。严禁在任何频道（论坛、Discord 等）发布涉及种族歧视、性别歧视、地域攻击、人身攻击或任何形式的骚扰言论。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">2. 游戏内规则</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
              <li><strong>遵守交通规则：</strong> 参与联运时，请遵守红绿灯、限速，切勿逆行、恶意别车。</li>
              <li><strong>禁止作弊：</strong> 严禁使用任何修改游戏物理引擎的外挂（如飞行、加速、无敌模式）。</li>
              <li><strong>禁止碰撞：</strong> 除非是娱乐活动，日常联运中请尽量避免撞击队友，发生事故请按 F7 救援。</li>
              <li><strong>安全距离：</strong> 高速行驶时请保持安全车距，避免连环追尾。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">3. 论坛发帖规范</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
              <li>请根据内容选择正确的版块和主题分类（如：公告、综合讨论、提问求助）。</li>
              <li>禁止恶意灌水（如纯表情回复、无意义字符）。</li>
              <li>未经允许，禁止发布其他社区或商业性质的广告。</li>
              <li>发布截图或视频时，请确保不包含违规内容。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-400 mb-3">4. 处罚机制</h2>
            <p>违反上述规则的用户，社区管理团队将视情节严重程度采取以下措施：</p>
            <div className="flex gap-4 mt-3">
              <span className="bg-yellow-900/30 text-yellow-500 border border-yellow-700/50 px-2 py-1 rounded text-xs">口头警告</span>
              <span className="bg-orange-900/30 text-orange-500 border border-orange-700/50 px-2 py-1 rounded text-xs">禁言 (1-7天)</span>
              <span className="bg-red-900/30 text-red-500 border border-red-700/50 px-2 py-1 rounded text-xs">封禁游戏权限 (最高永久)</span>
            </div>
          </section>
        </div>
        
        <div className="mt-8 text-center text-sm">
          <Link href="/" className="text-blue-400 hover:text-white transition">← 返回主页</Link>
        </div>
      </div>
    </main>
  );
}