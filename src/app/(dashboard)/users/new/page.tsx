"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import UserForm, { type UserInput } from "@/components/users/UserForm";

export default function NewUserPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok) throw new Error("Unable to verify permissions.");
        const data = await response.json();
        if (mounted) setAuthorized(data.user?.role === "admin");
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to verify permissions.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void checkAdmin();
    return () => { mounted = false; };
  }, [router]);

  async function createUser(values: UserInput) {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.status === 401) { router.replace("/login"); throw new Error("Your session has expired."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Unable to create user.");
    router.push("/users");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/users" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to users</Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Create user</h1>
        <p className="mt-2 text-sm text-slate-500">Create an account and assign its role.</p>
      </header>
      {loading ? <p className="text-sm text-slate-500">Checking permissions...</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : !authorized ? <p role="alert" className="text-sm text-red-600">Only administrators can create users.</p> : <UserForm mode="create" onSubmit={createUser} />}
    </div>
  );
}