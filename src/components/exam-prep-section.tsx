"use client";

// 期末复习共建组件：复习路线 + 重点章节，登录用户可编辑
// 数据存取：GET/PUT /api/courses/[code]/exam-prep

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, X, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";

interface Chapter {
  chapter: string;
  weight: string;
  note: string;
}

interface ExamPrepData {
  route: string[];
  chapters: Chapter[];
  updatedByName: string | null;
  updatedAt: string;
}

export function ExamPrepSection({
  courseCode,
  onExpand,
}: {
  courseCode: string;
  onExpand?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["exam-prep", courseCode],
    queryFn: () =>
      // api.get 对 {data:null} 响应会经 ?? 变成 undefined，React Query 视为非法；
      // 归一为 null，让"无备考数据"走正常空态（startEdit 也靠 data == null 拦截）
      api
        .get<ExamPrepData | null>(`/api/courses/${courseCode}/exam-prep`)
        .then((d) => d ?? null),
  });

  const [editing, setEditing] = useState(false);
  const [route, setRoute] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    // 数据未就绪（加载中 / 请求失败）时禁止进入编辑态，防止空快照覆盖既有内容
    if (isLoading || isError || data == null) return;
    setRoute(data.route);
    setChapters(data.chapters);
    setEditing(true);
    onExpand?.(); // 展开所在卡片，避免编辑器被折叠裁剪
  };

  const save = async () => {
    const cleanRoute = route.map((s) => s.trim()).filter(Boolean);
    const cleanChapters = chapters
      .map((c) => ({
        chapter: c.chapter.trim(),
        weight: c.weight.trim(),
        note: c.note.trim(),
      }))
      .filter((c) => c.chapter || c.weight || c.note);

    if (cleanChapters.some((c) => !c.chapter || !c.weight)) {
      toast.error("重点章节的每一行都需要填写「章节」和「分值占比」");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/courses/${courseCode}/exam-prep`, {
        route: cleanRoute,
        chapters: cleanChapters,
      });
      await queryClient.invalidateQueries({
        queryKey: ["exam-prep", courseCode],
      });
      toast.success("复习内容已保存");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  // ─── 编辑模式 ─────────────────────────────────────────
  if (editing) {
    return (
      <div className="space-y-5">
        {/* 复习路线编辑 */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            复习路线
          </h3>
          <div className="space-y-2">
            {route.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <input
                  value={step}
                  onChange={(e) =>
                    setRoute(route.map((s, j) => (j === i ? e.target.value : s)))
                  }
                  placeholder={`第 ${i + 1} 步，如：过一遍课件，整理知识框架（3天）`}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setRoute(route.filter((_, j) => j !== i))}
                  aria-label="删除该步骤"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRoute([...route, ""])}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="h-4 w-4" />
              添加一步
            </button>
          </div>
        </div>

        {/* 重点章节编辑 */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            重点章节
          </h3>
          <div className="space-y-2">
            {chapters.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={c.chapter}
                  onChange={(e) =>
                    setChapters(
                      chapters.map((x, j) =>
                        j === i ? { ...x, chapter: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="章节，如：第1-3章"
                  className="w-28 flex-shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={c.weight}
                  onChange={(e) =>
                    setChapters(
                      chapters.map((x, j) =>
                        j === i ? { ...x, weight: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="占比，如：约30%"
                  className="w-24 flex-shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={c.note}
                  onChange={(e) =>
                    setChapters(
                      chapters.map((x, j) =>
                        j === i ? { ...x, note: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="说明（可选）"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setChapters(chapters.filter((_, j) => j !== i))}
                  aria-label="删除该行"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setChapters([...chapters, { chapter: "", weight: "", note: "" }])
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="h-4 w-4" />
              添加章节
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    );
  }

  // ─── 展示模式 ─────────────────────────────────────────
  const routeList = data?.route ?? [];
  const chapterList = data?.chapters ?? [];
  const isEmpty = routeList.length === 0 && chapterList.length === 0;

  return (
    <div className="space-y-4">
      {/* 顶部操作行 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {data?.updatedByName
            ? `最后由 ${data.updatedByName} 更新于 ${data.updatedAt.slice(0, 10)}`
            : "内容由同学共建"}
        </span>
        <button
          type="button"
          onClick={startEdit}
          disabled={isLoading || isError}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </button>
      </div>

      {isLoading && (
        <div className="py-4 text-center text-sm text-slate-400">加载中...</div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-center">
          <p className="text-sm text-red-600">复习内容加载失败</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-xs font-medium text-blue-600 hover:underline"
          >
            点击重试
          </button>
        </div>
      )}

      {!isLoading && !isError && isEmpty && (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
          <p className="text-sm text-slate-400">
            暂无复习内容，点击右上角「编辑」贡献第一条
          </p>
        </div>
      )}

      {/* 复习路线 */}
      {routeList.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            复习路线
          </h3>
          <div className="space-y-2">
            {routeList.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md bg-blue-50 px-4 py-2.5"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-700">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 重点章节 */}
      {chapterList.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            重点章节
          </h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                    章节
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                    分值占比
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                    说明
                  </th>
                </tr>
              </thead>
              <tbody>
                {chapterList.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {c.chapter}
                    </td>
                    <td className="px-4 py-2.5 text-blue-600">{c.weight}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
