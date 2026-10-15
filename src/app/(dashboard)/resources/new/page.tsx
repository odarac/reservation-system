"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ResourceForm, { type ResourceInput } from "@/components/resources/ResourceForm";

export default function NewResourcePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkAdmin() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("Unable to verify permissions.");
        const data = await response.json();
        if (active) setAuthorized(data.user?.role === "admin");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to verify permissions.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void checkAdmin();
    return () => { active = false; };
  }, [router]);

  async function createResource(values: ResourceInput) {
    const response = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Your session has expired.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Unable to create resource.");
    router.push("/resources");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/resources" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to resources</Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Create resource</h1>
        <p className="mt-2 text-sm text-slate-500">Add a new bookable resource to Schedulio.</p>
      </header>
      {loading ? (
        <p className="text-sm text-slate-500">Checking permissions...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : !authorized ? (
        <p role="alert" className="text-sm text-red-600">Only administrators can create resources.</p>
      ) : (
        <ResourceForm submitLabel="Create resource" onSubmit={createResource} />
      )}
    </div>
  );
}