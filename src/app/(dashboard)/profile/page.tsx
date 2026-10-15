"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Profile = { id: string; name: string; email: string; role: "admin" | "user" };

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        if (response.status === 401) { router.replace("/login"); return; }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Unable to load profile.");
        if (mounted) {
          setProfile(data.user);
          setName(data.user.name);
          setEmail(data.user.email);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) {
      setError("New password must be between 8 and 128 characters."); return;
    }
    if (newPassword && !currentPassword) { setError("Enter your current password to change it."); return; }

    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      if (response.status === 401) { router.replace("/login"); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fields = data.details?.fieldErrors;
        const messages = fields ? Object.values(fields).flat().filter(Boolean) : [];
        throw new Error(messages.length ? messages.join(" ") : (data.error ?? "Unable to update profile."));
      }
      setProfile(data.user);
      setName(data.user.name);
      setEmail(data.user.email);
      setCurrentPassword("");
      setNewPassword("");
      if (data.passwordChanged) {
        router.replace("/login");
        return;
      }
      setSuccess("Profile updated successfully.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to dashboard</Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">My profile</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your account details and password.</p>
      </header>
      {loading ? <p className="text-sm text-slate-500">Loading profile...</p> : !profile ? (
        <p role="alert" className="text-sm text-red-600">{error || "Unable to load profile."}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Full name</span>
            <input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} className={inputClass} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Email address</span>
            <input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} className={inputClass} />
          </label>
          <div className="border-t border-slate-100 pt-5">
            <h2 className="font-semibold text-slate-900">Change password</h2>
            <p className="mt-1 text-sm text-slate-500">Leave these fields blank to keep your existing password. Changing your password will sign you out of all sessions.</p>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Current password</span>
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={saving} className={inputClass} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">New password</span>
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={saving} className={inputClass} />
          </label>
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      )}
    </div>
  );
}