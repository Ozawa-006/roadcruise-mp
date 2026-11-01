import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | 公路游轮运输`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Road Cruise Transport MP",
    "欧洲卡车模拟2",
    "欧卡2联运",
    "TruckersMP",
    "公路游轮",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "zh_CN",
    title: `${SITE_NAME} | 公路游轮运输`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} | 公路游轮运输`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
