"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Compass } from "lucide-react";

const guideKey = (userId: string) => `qiushi:guide:v1:${userId}`;
export function rememberGuide(userId: string) {
  try {
    localStorage.setItem(guideKey(userId), "seen");
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

export function NewUserGuideBanner({ userId, pathname }: { userId: string; pathname: string }) {
  const [visibleFor, setVisibleFor] = useState<string | null>(null);
  useEffect(() => {
    if (pathname === "/guide") {
      setVisibleFor(null);
      return;
    }
    try {
      setVisibleFor(localStorage.getItem(guideKey(userId)) ? null : userId);
    } catch {
      setVisibleFor(userId);
    }
  }, [userId, pathname]);
  if (pathname === "/guide" || visibleFor !== userId) return null;
  const dismiss = () => {
    rememberGuide(userId);
    setVisibleFor(null);
  };
  return (
    <section
      aria-label="新手引导提示"
      className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 sm:px-5"
    >
      <Compass className="hidden h-7 w-7 shrink-0 text-blue-600 sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-semibold text-slate-900">第一次使用求是学径？</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          用四步认识培养方案、课程库和学习资料。
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/guide"
          onClick={dismiss}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          看看怎么用
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-10 px-1 text-xs text-slate-500 hover:text-slate-800"
        >
          暂时跳过
        </button>
      </div>
    </section>
  );
}
