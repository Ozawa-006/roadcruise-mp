/**
 * 轻量 i18n：不引入第三方依赖。
 * - Locale 由 Cookie（服务端渲染）与 localStorage（客户端记忆）共同决定。
 * - 页面用 `useT({ 'zh-CN': {...}, en: {...} })` 或服务端 `t(locale, {...}, key)`。
 * - 键值缺省时回退中文，再回退 key 本身，避免漏翻导致空白。
 */

export type Locale = 'zh-CN' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALE_COOKIE = 'rct_locale';
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALES: ReadonlyArray<{ value: Locale; label: string; shortLabel: string }> = [
  { value: 'zh-CN', label: '简体中文', shortLabel: '简中' },
  { value: 'en', label: 'English', shortLabel: 'EN' },
];

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === 'en' ? 'en' : DEFAULT_LOCALE;
}

export type LocaleMessages<T extends string> = Record<Locale, Record<T, string>>;

export function pickMessage<T extends string>(
  locale: Locale,
  messages: LocaleMessages<T>,
  key: T
): string {
  const selected = messages[locale]?.[key];
  if (selected) return selected;
  const fallback = messages[DEFAULT_LOCALE]?.[key];
  return fallback ?? String(key);
}

export function formatMessage(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function translate<T extends string>(
  locale: Locale,
  messages: LocaleMessages<T>,
  key: T,
  vars?: Record<string, string | number>
): string {
  return formatMessage(pickMessage(locale, messages, key), vars);
}

/** 服务端简写：以中文原文为 key，按 locale 取英文，缺省回退中文。 */
export function tr(locale: Locale, en: Record<string, string>, zh: string): string {
  return locale === 'en' ? en[zh] ?? zh : zh;
}
