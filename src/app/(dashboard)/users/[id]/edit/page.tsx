"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import UserForm, { type UserInput, type UserRole } from "@/components/users/UserForm";

type ManagedUser = { id: string; name: string; email: string; role: UserRole };

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        if (meResponse.status === 401) { router.replace("/login"); return; }
        if (!meResponse.ok) throw new Error("Unable to verify permissions.");
        const me = await meResponse.json();
        if (me.user?.role !== "admin") return;
        if (mounted) setAuthorized(true);

        const response = await fetch(`/api/users/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Unable to load user.");
        if (!data.user) throw new Error("User not found.");
        if (mounted) setUser(data.user);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load user.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [id, router]);

  async function updateUser(values: UserInput) {
    const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.status === 401) { router.replace("/login"); throw new Error("Your session has expired."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Unable to update user.");
    router.push("/users");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/users" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to users</Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Edit user</h1>
        <p className="mt-2 text-sm text-slate-500">Update account details, role, or password.</p>
      </header>
      {loading ? <p className="text-sm text-slate-500">Loading user...</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : !authorized ? <p role="alert" className="text-sm text-red-600">Only administrators can edit users.</p> : user ? <UserForm key={user.id} mode="edit" initialValues={{ name: user.name, email: user.email, role: user.role }} onSubmit={updateUser} /> : null}
    </div>
  );
}