import { cookies } from 'next/headers';
import { normalizeLocale, LOCALE_COOKIE, type Locale } from './i18n';

/**
 * 服务端组件读取当前语言（Cookie 不存在时回退简体中文）。
 *
 * 注意：不要在这里 try/catch 吞掉 `cookies()` 的 dynamic bailout，
 * 否则 Next 会把页面当成静态页生成，导致语言 Cookie 不生效。
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}
