'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// 路由级错误边界：只对用户展示通用文案，具体错误仅记录到控制台，避免泄露服务端信息。
export default function Error({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <section className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-xl bg-[#2c2d31] border border-gray-700 rounded-lg shadow-lg p-8 md:p-10 text-center">
          <p className="text-blue-400 font-bold tracking-widest uppercase text-sm mb-3">
            Road Cruise Transport MP
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">页面加载失败</h1>
          <p className="text-gray-400 text-sm md:text-base mb-8">
            页面遇到了一点问题，请稍后重试。如果问题持续出现，请返回首页或联系管理员。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold transition shadow-lg"
            >
              重试
            </button>
            <Link
              href="/"
              className="w-full sm:w-auto border border-gray-600 hover:border-blue-500 hover:text-white text-gray-300 px-8 py-3 rounded-lg font-bold transition"
            >
              返回首页
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
