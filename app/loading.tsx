// 全局加载态：不依赖 Navbar，保持轻量，避免导航时闪烁。
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen bg-[#18191c] text-gray-400 flex items-center justify-center font-sans"
    >
      <span className="text-sm tracking-widest">加载中...</span>
    </div>
  );
}
