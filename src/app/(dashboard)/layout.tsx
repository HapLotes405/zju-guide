"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  GraduationCap, LayoutDashboard, BookOpen, FileText,
  Settings, LogOut, Menu, X, ChevronDown, User, Send,
  ClipboardList, Upload,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/courses", label: "课程库", icon: BookOpen },
  { href: "/contribute", label: "投稿", icon: Send },
  { href: "/resources", label: "学习资料", icon: FileText },
  { href: "/settings", label: "设置", icon: Settings },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { data: programsData, isLoading: programsLoading } = useQuery({
    queryKey: ["my-programs"],
    queryFn: () => api.get("/api/me/programs"),
    enabled: isAuthenticated,
  });
  const hasProgram = programsData && Array.isArray(programsData) && (programsData as Array<unknown>).length > 0;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isLoading && !programsLoading && isAuthenticated && !hasProgram && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [isLoading, programsLoading, isAuthenticated, hasProgram, pathname, router]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isLoading || programsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <GraduationCap className="h-10 w-10 animate-pulse text-indigo-300" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4">
          <div className="rounded-lg bg-indigo-600 p-1"><GraduationCap className="h-4 w-4 text-white" /></div>
          <span className="text-base font-bold text-slate-900">求是学径</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <a key={item.href} href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
                <Icon className="h-4 w-4 shrink-0" />{item.label}
              </a>
            );
          })}

          {user.role === "ADMIN" && (
            <>
              <div className="mx-2 my-2 border-t border-slate-100" />
              <p className="mx-3 mb-1 text-[11px] font-semibold uppercase text-slate-400">管理</p>
              {[{ href: "/admin/review", label: "审核队列", icon: ClipboardList }, { href: "/admin/import", label: "培养方案导入", icon: Upload }].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <a key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
                    <Icon className="h-4 w-4 shrink-0" />{item.label}
                  </a>
                );
              })}
            </>
          )}
        </nav>

        <div className="border-t border-slate-100 px-4 py-2.5">
          <p className="text-[11px] text-slate-400">求是学径 v0.1 · ZJU</p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur px-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="relative ml-auto">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline">{user.username}</span>
              <ChevronDown className={`h-3 w-3 text-slate-400 transition ${userMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{user.username}</p>
                    <p className="text-xs text-slate-400">{user.role === "ADMIN" ? "管理员" : "学生"}</p>
                  </div>
                  <button onClick={() => { setUserMenuOpen(false); logout(); router.replace("/login"); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut className="h-3.5 w-3.5" />退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
