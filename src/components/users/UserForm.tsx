"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export type UserRole = "admin" | "user";
export type UserInput = {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
};

type Props = {
  initialValues?: { name: string; email: string; role: UserRole };
  mode: "create" | "edit";
  onSubmit: (values: UserInput) => Promise<void>;
};

export default function UserForm({ initialValues, mode, onSubmit }: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [role, setRole] = useState<UserRole>(initialValues?.role ?? "user");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (mode === "create" && !password) {
      setError("A password is required for new users.");
      return;
    }
    if (password && password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        ...(password ? { password } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Full name</span>
        <input required maxLength={160} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} className={inputClass} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Email address</span>
        <input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} className={inputClass} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={saving} className={inputClass}>
          <option value="user">User</option>
          <option value="admin">Administrator</option>
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">{mode === "create" ? "Password" : "New password (optional)"}</span>
        <input type="password" minLength={8} required={mode === "create"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving} className={inputClass} />
        {mode === "edit" && <span className="block text-xs text-slate-500">Leave blank to keep the current password.</span>}
      </label>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link href="/users" className="inline-flex justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</Link>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : mode === "create" ? "Create user" : "Save changes"}</button>
      </div>
    </form>
  );
}