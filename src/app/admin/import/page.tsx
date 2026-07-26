"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Upload, CheckCircle, XCircle, FileJson } from "lucide-react";

export default function AdminImportPage() {
  const [jsonText, setJsonText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    majorName: string;
    year: number;
    coursesImported: number;
    status: string;
  }[] | null>(null);
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!jsonText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<{
        majorName: string;
        year: number;
        coursesImported: number;
        status: string;
      }[]>("/api/admin/programs/import", JSON.parse(jsonText));
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "导入失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setJsonText(e.target?.result as string);
      setResult(null);
      setError("");
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-xl font-bold text-slate-900">培养方案批量导入</h2>
      <p className="text-sm text-slate-500">
        admin only — 导入培养方案 JSON，支持单条或数组格式。已存在的会自动更新。
      </p>

      {/* Upload */}
      <div className="flex gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
          <Upload className="h-4 w-4" />
          选择 JSON 文件
          <input type="file" accept=".json" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }} />
        </label>
        <span className="self-center text-xs text-slate-400">或直接粘贴 JSON</span>
      </div>

      {/* Textarea */}
      <textarea
        value={jsonText}
        onChange={(e) => { setJsonText(e.target.value); setResult(null); setError(""); }}
        placeholder={`[{ "majorName": "...", "year": 2025, "totalCredits": 170, "requirementGroups": [...], "courses": [...] }]`}
        rows={14}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {/* Import button */}
      <button
        onClick={handleImport}
        disabled={loading || !jsonText.trim()}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-indigo-500 disabled:opacity-50"
      >
        <FileJson className="h-4 w-4" />
        {loading ? "导入中..." : "导入"}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle className="h-4 w-4" />
            导入成功 — {result.length} 个培养方案
          </div>
          <div className="space-y-1">
            {result.map((r, i) => (
              <div key={i} className="text-xs text-emerald-700">
                {r.majorName} ({r.year}级) — {r.coursesImported} 门课程
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
