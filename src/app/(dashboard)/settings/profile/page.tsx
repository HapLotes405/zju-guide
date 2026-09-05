"use client";

import { User as UserIcon, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAuth, type User } from "@/hooks/use-auth";

function PersonalInfo({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const [username, setUsername] = useState(user.username);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(user.avatar);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(user.avatar); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, user.avatar]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData();
      form.set("username", username.trim());
      if (file) form.set("avatar", file);
      await updateProfile(form);
      toast.success("个人信息已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-5 font-semibold text-slate-900">个人信息</h3>
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100">
          {preview ? <img src={preview} alt="头像预览" className="h-full w-full object-cover" /> : <UserIcon className="h-7 w-7 text-blue-600" />}
        </div>
        <div className="min-w-0">
          <p className="break-all text-lg font-semibold text-slate-900">{user.username}</p>
          <p className="text-sm text-slate-500">{user.role === "ADMIN" ? "管理员" : user.role === "CONTRIBUTOR" ? "贡献者" : "学生"}</p>
        </div>
      </div>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="profile-avatar" className="mb-2 block text-sm font-medium text-slate-700">修改头像</label>
          <button type="button" disabled={saving} onClick={() => avatarInput.current?.click()} className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 disabled:opacity-50">选择头像</button>
          <input ref={avatarInput} id="profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" disabled={saving}
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              if (selected && (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 1024 * 1024)) {
                toast.error("请选择不超过 1MB 的 PNG、JPEG 或 WebP 图片");
                event.target.value = "";
                setFile(null);
                return;
              }
              setFile(selected);
            }} />
          <p className="mt-1 text-xs text-slate-400">支持 PNG、JPEG、WebP，最大 1MB</p>
        </div>
        <div>
          <label htmlFor="profile-username" className="mb-2 block text-sm font-medium text-slate-700">用户名</label>
          <input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={2} maxLength={50} disabled={saving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <p className="mt-1 text-xs text-slate-400">2–50 个字符，修改后请使用新用户名登录</p>
        </div>
        <button type="submit" disabled={saving || (!file && username.trim() === user.username)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "保存中…" : "保存修改"}
        </button>
      </form>
    </section>
  );
}


function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (/\p{Script=Han}/u.test(newPassword)) { toast.error("密码不能包含汉字"); return; }
    if (newPassword !== confirmation) { toast.error("两次输入的新密码不一致"); return; }
    setSaving(true);
    try {
      await api.patch("/api/auth/password", { currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      toast.success("密码已修改，下次登录请使用新密码");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码修改失败");
    } finally { setSaving(false); }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 className="mb-5 font-semibold text-slate-900">修改密码</h3>
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor="current-password" className="mb-2 block text-sm font-medium text-slate-700">当前密码</label>
        <input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={saving} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">新密码</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={6} maxLength={72} value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={saving} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <p className="mt-1 text-xs text-slate-400">至少 6 个字符，不超过 72 字节，不允许包含汉字</p>
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-700">确认新密码</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "保存中…" : "修改密码"}
      </button>
    </form>
  </section>;
}

export default function ProfilePage() {
  const { user } = useAuth();
  return <div className="mx-auto max-w-4xl space-y-6">
    <Link href="/settings" className="text-sm text-blue-600 hover:underline">← 返回设置</Link>
    <h2 className="text-xl font-bold text-slate-900">修改个人信息</h2>
    {user && <PersonalInfo key={user.updatedAt} user={user} />}
    <PasswordForm />
  </div>;
}
