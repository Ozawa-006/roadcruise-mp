'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatMessage,
  normalizeLocale,
  pickMessage,
  LOCALE_COOKIE,
  LOCALE_MAX_AGE,
  type Locale,
  type LocaleMessages,
} from '@/lib/i18n';

const LocaleContext = createContext<Locale>('zh-CN');

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  // 服务端刷新后同步；首次加载时用 localStorage 兜底（Cookie 异常时）。
  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_COOKIE);
      if (stored) setLocale(normalizeLocale(stored));
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);

  // 同步 <html lang>，便于无障碍与 SEO（SSR 由根布局设置，切换后由这里更新）。
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** 页面内联翻译：useT({ 'zh-CN': {...}, en: {...} }) */
export function useT<T extends string>(messages: LocaleMessages<T>) {
  const locale = useLocale();
  return (key: T, vars?: Record<string, string | number>) =>
    formatMessage(pickMessage(locale, messages, key), vars);
}

/**
 * 以中文原文为 key 的简写翻译：
 *   const tr = useTr({ '首页': 'Home', '登录': 'Sign in' });
 *   tr('首页')
 * 英文缺失时回退中文，方便逐步补翻译。
 */
export function useTr(en: Record<string, string>) {
  const locale = useLocale();
  return (zh: string, vars?: Record<string, string | number>) => {
    const text = locale === 'en' ? en[zh] ?? zh : zh;
    return formatMessage(text, vars);
  };
}

/** 切换语言：写 Cookie + localStorage，并刷新服务端组件。 */
export function useSetLocale() {
  const router = useRouter();

  return (next: Locale) => {
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_MAX_AGE}; SameSite=Lax`;
      window.localStorage.setItem(LOCALE_COOKIE, next);
    } catch {
      /* 忽略 */
    }
    router.refresh();
  };
}
