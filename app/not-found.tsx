import Link from 'next/link';
import Navbar from '../components/Navbar';

// 全局 404 页面：由根布局包裹，无需 metadata（Next.js 会自动注入 noindex）。
export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      <section className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-xl bg-[#2c2d31] border border-gray-700 rounded-lg shadow-lg p-8 md:p-10 text-center">
          <p className="text-blue-400 font-bold tracking-widest uppercase text-sm mb-3">
            Road Cruise Transport MP
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
            404 / 页面不存在
          </h1>
          <p className="text-gray-400 text-sm md:text-base mb-8">
            你访问的页面可能已被移动、删除，或者链接地址有误。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold transition shadow-lg"
            >
              返回首页
            </Link>
            <Link
              href="/forum"
              className="w-full sm:w-auto border border-gray-600 hover:border-blue-500 hover:text-white text-gray-300 px-8 py-3 rounded-lg font-bold transition"
            >
              前往论坛
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
