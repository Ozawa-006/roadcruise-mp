import { cookies } from 'next/headers';
import { normalizeLocale, LOCALE_COOKIE, type Locale } from './i18n';

/** 服务端组件读取当前语言（Cookie 不存在时回退简体中文）。 */
export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return 'zh-CN';
  }
}
