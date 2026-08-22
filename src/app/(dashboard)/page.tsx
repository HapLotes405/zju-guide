"use client";

// ─── 仪表盘首页 ──────────────────────────────────────
// 专业组合选择器（年级 + 主修/至多三个辅修）+ 内嵌培养方案视图。
// 培养方案视图由共享组件 ProgramDocumentView 渲染（其内部 GET /api/programs/[id]），
// 这里只负责决定 programId：取当前应用的主修方案（GET /api/me/programs 的 MAJOR，
// 或应用专业组合成功后 PUT /api/me/programs 返回数据里的 MAJOR）。

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { ProgramDocumentView } from "@/components/program-document-view";

// ─── 类型 ────────────────────────────────────────
interface ProgramOption {
  id: string;
  majorName: string;
  year: number;
  totalCredits: number;
}

interface ProgramCatalog {
  years: { year: number; majors: string[] }[];
  options: ProgramOption[];
  total: number;
}

interface UserProgram {
  id: string;
  userId: string;
  programVersionId: string;
  type: "MAJOR" | "MINOR";
  isConfirmed: boolean;
  programVersion: ProgramOption;
}

// ─── 专业组合选择器（主修 / 辅修下拉） ────────────────
function ProgramCombobox({
  label,
  value,
  options,
  placeholder,
  onChange,
  onRemove,
  disabled = false,
}: {
  label: string;
  value: string;
  options: ProgramOption[];
  placeholder: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasExactSelection = options.some((program) => program.majorName === value);
  const filteredOptions = value && !hasExactSelection
    ? options.filter((program) =>
        program.majorName.toLowerCase().includes(value.toLowerCase()),
      )
    : options;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className="block" ref={rootRef}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          disabled={disabled}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onChange={(event) => {
            onChange(event.target.value);
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "ArrowDown") setOpen(true);
          }}
          placeholder={placeholder}
          className={`h-10 w-full border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
            onRemove ? "pr-20" : "pr-10"
          }`}
        />
        <button
          type="button"
          aria-label={open ? `收起${label}选项` : `展开${label}选项`}
          onClick={() => { if (!disabled) setOpen((current) => !current); }}
          disabled={disabled}
          className={`absolute top-0 flex h-10 w-10 items-center justify-center text-slate-400 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300 ${
            onRemove ? "right-10" : "right-0"
          }`}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {onRemove && (
          <button
            type="button"
            aria-label={`移除${label}`}
            onClick={onRemove}
            className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {open && !disabled && (
          <div
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+7px)] z-30 max-h-64 overflow-y-auto border border-blue-200 bg-white p-1.5 shadow-[0_18px_42px_rgb(15_23_42_/_0.16)]"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1.5 left-6 h-3 w-3 rotate-45 border-l border-t border-blue-200 bg-white"
            />
            {filteredOptions.length > 0 ? (
              filteredOptions.map((program) => {
                const optionValue = program.majorName;
                const selected = optionValue === value;
                return (
                  <div
                    key={program.id}
                    role="option"
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={() => {
                      onChange(optionValue);
                      setOpen(false);
                    }}
                    onKeyDown={(e) => {
                      // 键盘可选择（Enter / Space），与点击行为一致
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onChange(optionValue);
                        setOpen(false);
                      }
                    }}
                    className={`relative flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selected
                        ? "bg-blue-50 font-semibold text-blue-800"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 text-transparent"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="flex-1 truncate">{optionValue}</span>
                  </div>
                );
              })
            ) : (
              <p className="px-3 py-5 text-center text-sm text-slate-400">没有匹配的专业</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────
export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [majorInput, setMajorInput] = useState("");
  const [minorInputs, setMinorInputs] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [programsInitialized, setProgramsInitialized] = useState(false);
  const [programError, setProgramError] = useState("");

  const { data: programCatalog, isLoading: programCatalogLoading, error: programCatalogError } = useQuery<ProgramCatalog>({
    queryKey: ["programs"],
    queryFn: () => api.get("/api/programs"),
  });

  const { data: userPrograms, isLoading: userProgramsLoading } = useQuery<UserProgram[]>({
    queryKey: ["my-programs"],
    queryFn: () => api.get("/api/me/programs"),
  });

  const programOptions = programCatalog?.options ?? [];
  const yearOptions = useMemo(
    () => (selectedYear == null ? [] : programOptions.filter((p) => p.year === selectedYear)),
    [programOptions, selectedYear],
  );

  // 初始化：从已保存方案回填年级/主修/辅修，并记录主修方案 id
  useEffect(() => {
    if (programsInitialized || !userPrograms) return;
    const major = userPrograms.find((program) => program.type === "MAJOR");
    const minors = userPrograms
      .filter((program) => program.type === "MINOR")
      .slice(0, 3);
    setSelectedYear(major?.programVersion.year ?? null);
    setMajorInput(major?.programVersion.majorName ?? "");
    setMinorInputs(minors.map((program) => program.programVersion.majorName));
    setProgramsInitialized(true);
  }, [programsInitialized, userPrograms]);

  // 当前应用的主修方案：唯一来源是 /api/me/programs 里的 MAJOR。
  // 应用专业组合成功后，onSuccess 用 PUT 返回数据 setQueryData 同步缓存，
  // userPrograms 更新 → 下方 currentMajorId 自动重算 → 内嵌视图切换到新方案（无需额外状态）。
  const appliedMajor =
    userPrograms?.find((p) => p.type === "MAJOR")?.programVersion ?? null;
  const currentMajorId = appliedMajor?.id ?? null;

  // 已应用辅修：传给内嵌视图的「辅修方案」Tab 展示"我的辅修"
  const appliedMinors =
    userPrograms
      ?.filter((p) => p.type === "MINOR")
      .slice(0, 3)
      .map((p) => ({
        id: p.programVersionId,
        majorName: p.programVersion.majorName,
        year: p.programVersion.year,
      })) ?? [];

  // 草稿（选择器当前所选）与已应用主修不一致时提示，避免"改了没反应"的困惑
  const draftDiffers =
    selectedYear != null &&
    majorInput !== "" &&
    appliedMajor != null &&
    (selectedYear !== appliedMajor.year || majorInput !== appliedMajor.majorName);

  const updatePrograms = useMutation({
    mutationFn: (selection: { majorProgramVersionId: string; minorProgramVersionIds: string[] }) =>
      api.put<UserProgram[]>("/api/me/programs", selection),
    onSuccess: (programs) => {
      setProgramError("");
      // 用 PUT 返回的完整 userProgram 列表同步缓存，内嵌培养方案视图立即切到新主修
      queryClient.setQueryData(["my-programs"], programs);
    },
  });

  const applyProgramSelection = () => {
    if (selectedYear == null) {
      setProgramError("请先选择年级");
      return;
    }
    const findProgram = (majorName: string) =>
      programOptions.find(
        (program) => program.year === selectedYear && program.majorName === majorName,
      );
    const major = findProgram(majorInput);
    // 空辅修槽（未填的"添加辅修"槽位）不应参与校验，只校验真正填了内容的槽
    const minors = minorInputs
      .filter((input) => input.trim() !== "")
      .map((input) => findProgram(input));

    if (!major) {
      setProgramError("请从候选列表中选择一个主修专业");
      return;
    }
    if (minors.some((program) => !program)) {
      setProgramError("请从候选列表中完成辅修专业选择");
      return;
    }

    const minorIds = minors
      .filter((program): program is ProgramOption => Boolean(program))
      .map((program) => program.id);
    if (new Set([major.id, ...minorIds]).size !== minorIds.length + 1) {
      setProgramError("主修与辅修专业不能重复");
      return;
    }

    setProgramError("");
    updatePrograms.mutate({
      majorProgramVersionId: major.id,
      minorProgramVersionIds: minorIds,
    });
  };

  return (
    <div className="dashboard-home space-y-5">
      {/* ── 专业组合选择器卡 ── */}
      <div className="program-selector border border-slate-200 bg-white p-4 lg:p-5">
        {programCatalogLoading && (
          <p className="mb-4 text-xs text-slate-400">培养方案加载中...</p>
        )}
        {programCatalogError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>培养方案加载失败，请检查网络后重试</span>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["programs"] })}
              className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
            >
              重试
            </button>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">专业组合</h2>
            <p className="mt-1 text-xs text-slate-500">选择一个主修专业，可添加至多三个辅修专业</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyProgramSelection}
              disabled={updatePrograms.isPending || !majorInput || !selectedYear || !programCatalog}
              className="geometry-button min-h-9 px-4 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {updatePrograms.isPending ? "应用中..." : "应用专业组合"}
            </button>
          </div>
        </div>

        {/* 第一步：选择年级 */}
        <div className="mb-4">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">年级</span>
          <div className="flex flex-wrap gap-2">
            {(programCatalog?.years ?? []).map(({ year }) => (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setSelectedYear(year);
                  setMajorInput("");
                  setMinorInputs([]);
                  setProgramError("");
                }}
                className={`min-h-9 rounded-lg border px-4 text-sm font-medium transition ${
                  selectedYear === year
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="novecento-number">{year}</span> 级
              </button>
            ))}
            {!programCatalogLoading &&
              !programCatalogError &&
              (programCatalog?.years ?? []).length === 0 && (
                <p className="text-xs text-slate-400">暂无可选的培养方案</p>
              )}
          </div>
          {selectedYear != null && (
            <p className="mt-1.5 text-xs text-slate-400">{yearOptions.length} 个专业可用 · 先选年级再搜索匹配专业</p>
          )}
        </div>

        {/* 第二步：选择专业 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ProgramCombobox
            label="主修专业"
            value={majorInput}
            options={selectedYear != null ? yearOptions : []}
            placeholder={selectedYear != null ? "输入并搜索主修专业" : "请先选择年级"}
            onChange={setMajorInput}
            disabled={selectedYear == null}
          />

          {minorInputs.map((minor, index) => (
            <ProgramCombobox
              key={`minor-${index}`}
              label={`辅修专业 ${index + 1}`}
              value={minor}
              options={selectedYear != null ? yearOptions : []}
              placeholder={selectedYear != null ? "输入并搜索辅修专业" : "请先选择年级"}
              onChange={(nextValue) => setMinorInputs((current) =>
                current.map((currentValue, itemIndex) => itemIndex === index ? nextValue : currentValue)
              )}
              onRemove={() => setMinorInputs((current) =>
                current.filter((_, itemIndex) => itemIndex !== index)
              )}
              disabled={selectedYear == null}
            />
          ))}

          {minorInputs.length < 3 && (
            <button
              type="button"
              onClick={() => setMinorInputs((current) => [...current, ""])}
              disabled={selectedYear == null}
              className="mt-[22px] flex h-10 items-center justify-center gap-1.5 border border-dashed border-blue-300 bg-blue-50/60 px-3 text-sm font-semibold text-blue-700 transition hover:border-blue-500 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <Plus className="h-4 w-4" />
              添加辅修专业
            </button>
          )}
        </div>

        {(programError || updatePrograms.error) && (
          <p className="mt-3 text-xs font-medium text-red-600">
            {programError ||
              (updatePrograms.error instanceof Error
                ? updatePrograms.error.message
                : "应用失败，请稍后重试")}
          </p>
        )}
      </div>

      {/* ── 培养方案视图（内嵌主页） ── */}
      {draftDiffers && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span className="font-semibold">已修改，尚未应用</span>
          <span className="text-amber-700">
            当前仍显示已保存的主修方案（{appliedMajor.year} 级 · {appliedMajor.majorName}），点击「应用专业组合」后生效。
          </span>
        </div>
      )}
      {userProgramsLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">加载培养方案中...</div>
      ) : currentMajorId ? (
        <ProgramDocumentView programId={currentMajorId} appliedMinors={appliedMinors} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <p className="text-sm text-slate-400">选择专业组合并点击「应用专业组合」查看培养方案</p>
        </div>
      )}
    </div>
  );
}
