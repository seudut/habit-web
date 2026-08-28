import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "习惯打卡",
  description: "记录每日作息习惯并查看月度统计",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
