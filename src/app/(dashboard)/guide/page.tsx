"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Search,
  Send,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { rememberGuide } from "@/components/new-user-guide";
import { api } from "@/lib/api-client";

const steps = [
  {
    title: "选择培养方案",
    icon: GraduationCap,
    location: "首次设置 · 仪表盘",
    description: "告诉网站你的入学年级和专业，让课程安排与你的培养方案对应起来。",
    points: [
      "先选择入学年级，再搜索并选择主修专业。",
      "可以先查看培养方案，再决定是否使用。",
      "以后在仪表盘调整主修、添加辅修，点击「应用专业组合」保存。",
    ],
    links: [{ href: "/", label: "去设置培养方案" }],
    tip: "入学年级对应培养方案的版本；不同年级的课程要求可能不同。",
  },
  {
    title: "认识仪表盘",
    icon: LayoutDashboard,
    location: "左侧导航 · 仪表盘",
    description: "仪表盘把培养方案变成可以浏览的课程清单，帮你看清各学期的安排和各类学分要求。",
    points: [
      "顶部切换年级、主修和辅修的专业组合。",
      "「按学期行动清单」查看每学期的课程安排，点击课程进入详情。",
      "「按学分进度板」查看课程组要求；还可以查看二三四课堂和辅修方案。",
    ],
    links: [{ href: "/", label: "打开仪表盘" }],
    tip: "进度板的勾选用于当前页面试算，刷新后会重置。正式修读记录请以教务系统为准。",
  },
  {
    title: "查看课程与资料",
    icon: BookOpen,
    location: "左侧导航 · 课程库 / 学习资料",
    description: "从一门课出发了解学习内容，也可以直接在学习资料里寻找同学分享的笔记和复习资源。",
    points: [
      "课程库支持按课程名称或课号搜索，点开课程查看课程信息、学习指南和先修关系。",
      "课程资料按平时学习、小测、期中、期末分组；学习资料页还能集中浏览和筛选。",
      "附件旁点击「预览」即可阅读 PDF、查看 PNG / JPG 图片；需要保存时点击「下载附件」。",
    ],
    links: [
      { href: "/courses", label: "去课程库" },
      { href: "/resources", label: "浏览学习资料" },
    ],
    tip: "手机上点击左上角菜单即可展开导航，找到与电脑端相同的入口。",
  },
  {
    title: "分享学习资源",
    icon: Send,
    location: "左侧导航 · 投稿 / 设置",
    description: "把你整理的笔记、课程经验或有用的链接分享出来，让后来的同学少走一些弯路。",
    points: [
      "在「投稿」填写标题和内容，选择资料类型、适用阶段并关联课程。",
      "可以上传附件，也可以分享外部链接；提交后进入审核流程。",
      "审核通过的资料会出现在对应课程和学习资料页，在「设置」可查看自己的投稿状态。",
    ],
    links: [
      { href: "/contribute", label: "去投稿" },
      { href: "/settings", label: "查看我的投稿" },
    ],
    tip: "想再看这份说明，随时从导航栏打开「新手引导」。",
  },
] as const;

function InterfacePreview({ step }: { step: number }) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
      aria-label="主要界面示意"
    >
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
        <span className="text-xs font-semibold text-slate-700">求是学径</span>
        <span className="text-[10px] text-slate-400">界面示意</span>
      </div>
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-800">你的培养方案，从这里开始</p>
          <div>
            <p className="mb-2 text-xs text-slate-500">入学年级</p>
            <div className="flex gap-2">
              {["2024 级", "2025 级", "2026 级"].map((year, index) => (
                <span
                  key={year}
                  className={`rounded-md border px-2 py-2 text-xs ${index === 1 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-400"}`}
                >
                  {year}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs text-slate-400">主修专业</p>
            <p className="flex items-center justify-between text-sm text-slate-700">
              选择你的专业
              <Check className="h-4 w-4 text-blue-600" aria-hidden="true" />
            </p>
          </div>
          <p className="text-xs text-slate-500">先看看培养方案 → 确认选择</p>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-blue-100 px-2 py-2 text-blue-700">按学期行动清单</span>
            <span className="px-2 py-2 text-slate-500">按学分进度板</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">第一学期</p>
          {["通识课程", "专业基础课程", "专业课程"].map((label, index) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span className="text-xs text-blue-500">0{index + 1}</span>
              <span className="flex-1 text-sm text-slate-700">{label}</span>
              <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-400">
            <Search className="h-4 w-4" aria-hidden="true" />
            搜索课程名称或课号…
          </div>
          <div className="flex gap-3 border-b border-slate-200 pb-2 text-xs">
            <span className="font-semibold text-blue-700">平时学习</span>
            <span className="text-slate-400">小测</span>
            <span className="text-slate-400">期中</span>
            <span className="text-slate-400">期末</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <FileText className="mb-3 h-6 w-6 text-blue-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800">同学分享的课程笔记</p>
            <p className="mt-1 text-xs text-slate-400">课程笔记.pdf</p>
            <div className="mt-4 flex items-center gap-3 text-xs">
              <span className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
                预览
              </span>
              <span className="text-slate-500">下载附件</span>
            </div>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-800">分享一份资料</p>
          {["标题与内容", "关联课程 · 适用阶段", "附件或外部链接"].map((label) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500"
            >
              {label}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <span className="text-blue-700">提交投稿</span>
            <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
            <span className="text-amber-700">等待审核</span>
            <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden="true" />
            <span className="text-emerald-700">公开分享</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  const [active, setActive] = useState(0);
  const { user } = useAuth();
  const userId = user?.id;
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(active);
  const { data: programs } = useQuery<unknown[]>({
    queryKey: ["my-programs"],
    queryFn: () => api.get<unknown[]>("/api/me/programs"),
    enabled: !!userId,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (userId) rememberGuide(userId);
  }, [userId]);
  useEffect(() => {
    if (previousStep.current !== active) heading.current?.focus();
    previousStep.current = active;
  }, [active]);
  const step = steps[active]!;
  const Icon = step.icon;
  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="max-w-3xl">
        <p className="mb-3 text-xs font-semibold tracking-wider text-blue-600">欢迎来到求是学径</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">新手引导</h1>
        <p className="mt-4 text-lg font-medium leading-8 text-slate-800">
          先看清培养要求，再找到学习资料。
        </p>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          这里把浙大的培养方案、课程信息和同学分享的学习资源放在一起。用下面四步熟悉主要界面，找到你现在需要的入口。
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="引导步骤" className="grid grid-cols-2 gap-2 self-start lg:grid-cols-1">
          {steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              aria-label={`${index + 1} ${item.title}`}
              aria-current={active === index ? "step" : undefined}
              aria-controls="guide-content"
              onClick={() => setActive(index)}
              className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition sm:gap-3 ${active === index ? "border-blue-200 bg-blue-50 font-semibold text-blue-800" : "border-transparent text-slate-500 hover:bg-slate-100"}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${active === index ? "bg-blue-600 text-white" : "bg-slate-200/60 text-slate-500"}`}
              >
                {index + 1}
              </span>
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <section
          id="guide-content"
          aria-live="polite"
          aria-atomic="true"
          className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <div className="grid gap-7 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="mb-5 flex items-center gap-2 text-xs text-blue-600">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {step.location}
              </div>
              <h2
                ref={heading}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 outline-none"
              >
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{step.description}</p>
              <ol className="mt-5 space-y-4">
                {step.points.map((point, index) => (
                  <li key={point} className="flex gap-3 text-sm leading-6 text-slate-600">
                    <span className="mt-0.5 text-xs font-semibold text-blue-500">{index + 1}.</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ol>
              {!programs?.length && active >= 2 && (
                <p className="mt-5 text-xs leading-6 text-amber-700">
                  浏览学习资料、投稿和查看投稿前，需要先选择培养方案；相关入口会先带你完成选择。
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
                {step.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    {link.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
            <InterfacePreview step={active} />
          </div>
          <p className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-xs leading-6 text-slate-500 sm:px-7">
            {step.tip}
          </p>
        </section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
        <p className="text-xs tabular-nums text-slate-400">
          {active + 1} / {steps.length} · 随时可以回来查看
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={active === 0}
            onClick={() => setActive((n) => n - 1)}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            上一步
          </button>
          {active < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setActive((n) => n + 1)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              下一步
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              开始使用
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
