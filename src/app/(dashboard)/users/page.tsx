"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/components/users/UserForm";

type ManagedUser = { id: string; name: string; email: string; role: UserRole; createdAt?: string };

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        if (meResponse.status === 401) { router.replace("/login"); return; }
        if (!meResponse.ok) throw new Error("Unable to verify permissions.");
        const me = await meResponse.json();
        if (me.user?.role !== "admin") return;
        if (mounted) {
          setAuthorized(true);
          setCurrentUserId(me.user.id);
        }
        const response = await fetch("/api/users", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Unable to load users.");
        if (mounted) setUsers(data.users ?? []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load users.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => [u.name, u.email, u.role].some((value) => value.toLowerCase().includes(q)));
  }, [users, search]);

  async function deleteUser(user: ManagedUser) {
    if (deletingId || user.id === currentUserId) return;
    if (!window.confirm(`Permanently delete ${user.name} (${user.email})?`)) return;
    setActionError("");
    setDeletingId(user.id);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      if (response.status === 401) { router.replace("/login"); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to delete user.");
      setUsers((current) => current.filter((u) => u.id !== user.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to delete user.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">User management</h1>
          <p className="mt-2 text-sm text-slate-500">Manage accounts and access to Schedulio.</p>
        </div>
        {authorized && <Link href="/users/new" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">+ Create user</Link>}
      </header>

      {loading ? <p className="text-sm text-slate-500">Loading users...</p> : error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">{error}</p>
      ) : !authorized ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700">Only administrators can manage users.</p>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-500">{filteredUsers.length} of {users.length} users</p>
            <input type="search" aria-label="Search users" placeholder="Search name, email, or role..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 sm:w-72" />
          </div>
          {actionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{user.name}{user.id === currentUserId && <span className="ml-2 text-xs font-normal text-slate-500">(You)</span>}</td>
                    <td className="px-5 py-4 text-slate-600">{user.email}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.role === "admin" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>{user.role === "admin" ? "Administrator" : "User"}</span></td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <Link href={`/users/${encodeURIComponent(user.id)}/edit`} className="mr-4 font-medium text-blue-600 hover:text-blue-700">Edit</Link>
                      <button type="button" onClick={() => void deleteUser(user)} disabled={deletingId !== null || user.id === currentUserId} title={user.id === currentUserId ? "You cannot delete your own account" : "Delete user"} className="font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40">{deletingId === user.id ? "Deleting..." : "Delete"}</button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}