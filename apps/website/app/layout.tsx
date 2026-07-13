import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIvra Team — 自定义你的智能体团队",
  description: "在一个桌面工作空间中创建角色、连接技能与知识库，让智能体团队协作推进对话、任务和项目。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
