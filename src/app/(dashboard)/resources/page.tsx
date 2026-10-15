"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Resource = {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
  is_active?: boolean;
  isActive?: boolean;
};

type AvailabilityFilter = "all" | "active" | "inactive";

function isResourceActive(resource: Resource) {
  return resource.is_active ?? resource.isActive ?? true;
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadResources() {
      try {
        setLoading(true);
        const [resourcesResponse, userResponse] = await Promise.all([
          fetch("/api/resources", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        if (resourcesResponse.status === 401 || userResponse.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!resourcesResponse.ok) throw new Error("Unable to load resources.");
        if (!userResponse.ok) throw new Error("Unable to verify permissions.");
        const [resourcesData, userData] = await Promise.all([
          resourcesResponse.json(),
          userResponse.json(),
        ]);
        if (!active) return;
        setResources(resourcesData.resources ?? []);
        setIsAdmin(userData.user?.role === "admin");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadResources();
    return () => { active = false; };
  }, []);

  async function handleDelete(resource: Resource) {
    if (!isAdmin || deletingId) return;
    if (!window.confirm(`Delete "${resource.name}"? This action may be irreversible.`)) return;
    setDeletingId(resource.id);
    setActionError("");
    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(resource.id)}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to delete resource.");
      setResources((current) => current.filter((item) => item.id !== resource.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to delete resource.");
    } finally {
      setDeletingId(null);
    }
  }

  const activeCount = resources.filter(isResourceActive).length;
  const inactiveCount = resources.length - activeCount;
  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesSearch = [resource.name, resource.description ?? ""]
        .some((value) => value.toLowerCase().includes(query));
      const active = isResourceActive(resource);
      const matchesAvailability = availability === "all" ||
        (availability === "active" && active) ||
        (availability === "inactive" && !active);
      return matchesSearch && matchesAvailability;
    });
  }, [resources, search, availability]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600">Resource directory</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Resources</h1>
          <p className="mt-2 text-sm text-slate-500">Browse rooms, equipment, and other bookable resources.</p>
        </div>
        {isAdmin && (
          <Link href="/resources/new" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700">
            + Create resource
          </Link>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total resources" value={resources.length} />
        <StatCard label="Active resources" value={activeCount} />
        <StatCard label="Inactive resources" value={inactiveCount} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Available resources</h2>
            <p className="mt-1 text-sm text-slate-500">{filteredResources.length} {filteredResources.length === 1 ? "resource" : "resources"} found</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search resources..." aria-label="Search resources"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-64" />
            <select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}
              aria-label="Filter resources by availability"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="all">All resources</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
        </div>

        {actionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading resources...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-white p-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">Try again</button>
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
            <h3 className="font-semibold text-slate-900">{resources.length === 0 ? "No resources found" : "No matching resources"}</h3>
            <p className="mt-2 text-sm text-slate-500">{resources.length === 0 ? "Resources will appear here once they have been added." : "Try another search term or filter."}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredResources.map((resource) => {
              const active = isResourceActive(resource);
              return (
                <article key={resource.id} className="relative flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                  <Link href={`/resources/${encodeURIComponent(resource.id)}`} aria-label={`View ${resource.name} availability`} className="absolute inset-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" />
                  <div className="pointer-events-none flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ResourceIcon /></div>
                    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"}`}>
                      {active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <h3 className="pointer-events-none mt-4 break-words text-lg font-semibold text-slate-900">{resource.name}</h3>
                  <p className="pointer-events-none mt-2 min-h-10 break-words text-sm leading-5 text-slate-500">{resource.description || "No description provided."}</p>
                  <p className="pointer-events-none mt-3 text-sm text-slate-600">Capacity: <span className="font-medium text-slate-900">{resource.capacity}</span></p>
                  <div className="relative z-10 mt-auto space-y-3 pt-5">
                    <div className="border-t border-slate-100 pt-4">
                      {active ? (
                        <Link href={`/reservations/new?resourceId=${encodeURIComponent(resource.id)}`} className="flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100">
                          Make a reservation <span className="ml-2" aria-hidden="true">→</span>
                        </Link>
                      ) : (
                        <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-center text-sm text-slate-500">Not available for booking</p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="grid grid-cols-2 gap-2">
                        <Link href={`/resources/${encodeURIComponent(resource.id)}/edit`}
                          className="flex justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Edit
                        </Link>
                        <button type="button" onClick={() => void handleDelete(resource)} disabled={deletingId !== null}
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                          {deletingId === resource.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function ResourceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M8 4v16M16 4v16M3.5 9h4.5M16 9h4.5M3.5 15h4.5M16 15h4.5" />
    </svg>
  );
}