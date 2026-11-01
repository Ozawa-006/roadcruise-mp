import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { I18nProvider } from "@/components/I18nProvider";
import { getLocale } from "@/lib/i18n-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 站点公开地址：优先读取 NEXTAUTH_URL，本地/预览环境回退到生产域名。
const SITE_URL = process.env.NEXTAUTH_URL ?? "https://www.roadcruise-mp.com";
const SITE_NAME = "Road Cruise Transport MP";
const SITE_DESCRIPTION = "欢迎来到属于卡友的公路世界！加入我们，体验最真实的欧卡2联运。";
const SITE_DESCRIPTION_EN =
  "Welcome to the truckers' highway world! Join us for the most authentic Euro Truck Simulator 2 convoys.";
const SITE_KEYWORDS = [
  "Road Cruise Transport MP",
  "欧洲卡车模拟2",
  "欧卡2联运",
  "TruckersMP",
  "公路游轮",
];
const SITE_KEYWORDS_EN = [
  "Road Cruise Transport MP",
  "Euro Truck Simulator 2",
  "ETS2 convoy",
  "TruckersMP",
  "Road Cruise",
];

/** 按当前语言输出站点级 metadata；中文保持原有文案。 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isEnglish = locale === "en";
  const title = isEnglish
    ? `${SITE_NAME} | Community & Convoys`
    : `${SITE_NAME} | 公路游轮运输`;
  const description = isEnglish ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${SITE_NAME}`,
    },
    description,
    keywords: isEnglish ? SITE_KEYWORDS_EN : SITE_KEYWORDS,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: isEnglish ? "en_US" : "zh_CN",
      title,
      description,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          Supabase 的找回密码链接会把用户带回站点根地址（#access_token=...&type=recovery）。
          在页面脚本之前检测并转到 /reset-password，保证“忘记密码”邮件点开即进入设置新密码页。
        */}
        <Script
          id="recovery-redirect"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var h=window.location.hash||'';if(h.indexOf('type=recovery')!==-1){window.location.replace('/reset-password'+h);}}catch(e){}})();",
          }}
        />
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
