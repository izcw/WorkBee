import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIvra Team｜为每项工作，组建专属数字团队",
  description: "AIvra 是本地优先的桌面 AI 工作空间。创建角色、连接知识、组织流程，让团队持续推进每一次对话与任务。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
