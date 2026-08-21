"use client";

// ─── 培养方案详情页（包装层） ────────────────────────
// 本页只是薄包装：负责解析路由参数 + 顶部返回按钮，
// 完整的方案视图（头部卡 + 4 Tab）由共享组件 ProgramDocumentView 渲染，
// 数据拉取与交互状态也都在该组件内部自行管理。
// 所有 Pane/GroupNode/统计函数等逻辑已迁入 src/components/program-document-view.tsx。

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProgramDocumentView } from "@/components/program-document-view";

export default function ProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // 从深链/直接打开进入时 history 可能为空，router.back() 会无响应，兜底回首页
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="space-y-5">
      {/* ── 返回 ── */}
      <button
        onClick={goBack}
        className="group inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-blue-600"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      {/* ── 完整培养方案视图 ── */}
      <ProgramDocumentView programId={params.id} />
    </div>
  );
}
