"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ResourceForm, { type ResourceInput, type ResourceType } from "@/components/resources/ResourceForm";

type Resource = {
  id: string;
  name: string;
  type: ResourceType,
  description?: string | null;
  capacity: number;
  is_active?: boolean;
  isActive?: boolean;
};

export default function EditResourcePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [resource, setResource] = useState<Resource | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const userResponse = await fetch("/api/auth/me", { cache: "no-store" });
        if (userResponse.status === 401) {
          router.replace("/login");
          return;
        }
        if (!userResponse.ok) throw new Error("Unable to verify permissions.");
        const userData = await userResponse.json();
        if (userData.user?.role !== "admin") return;
        if (active) setAuthorized(true);

        const response = await fetch(`/api/resources/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Unable to load resource.");
        }
        const data = await response.json();
        if (!data.resource) throw new Error("Resource not found.");
        if (active) setResource(data.resource);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load resource.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [id, router]);

  async function updateResource(values: ResourceInput) {
    const response = await fetch(`/api/resources/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Your session has expired.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Unable to update resource.");
    router.push("/resources");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/resources" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to resources</Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Edit resource</h1>
        <p className="mt-2 text-sm text-slate-500">Update the resource details and booking availability.</p>
      </header>
      {loading ? (
        <p className="text-sm text-slate-500">Loading resource...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : !authorized ? (
        <p role="alert" className="text-sm text-red-600">Only administrators can edit resources.</p>
      ) : resource ? (
        <ResourceForm
          initialValues={{
            name: resource.name,
            type: resource.type,
            description: resource.description ?? "",
            capacity: resource.capacity,
            isActive: resource.is_active ?? resource.isActive ?? true,
          }}
          submitLabel="Save changes"
          onSubmit={updateResource}
        />
      ) : null}
    </div>
  );
}
