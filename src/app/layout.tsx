import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "求是学径 — 浙大课程学习路径共建平台",
  description: "从培养方案到每周行动，从散落资料到可信路径",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
