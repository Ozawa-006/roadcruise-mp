'use client';

import { useEffect, useRef, useState } from 'react';
import { LOCALES } from '@/lib/i18n';
import { useLocale, useSetLocale } from '@/components/I18nProvider';

/** 导航栏语言切换（头像菜单旁的「🌐 简中」）。 */
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const current = LOCALES.find((item) => item.value === locale) ?? LOCALES[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="语言 / Language"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-gray-300 transition hover:text-white"
      >
        <span aria-hidden="true">🌐</span>
        <span>{compact ? current.shortLabel : current.label}</span>
        <span className="text-[10px] text-gray-500">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-md border border-gray-700 bg-[#2c2d31] py-1 shadow-2xl"
        >
          {LOCALES.map((item) => {
            const active = item.value === locale;
            return (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(item.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-blue-600/20 font-bold text-blue-300'
                    : 'text-gray-300 hover:bg-[#3a3b40] hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {active && <span className="text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
