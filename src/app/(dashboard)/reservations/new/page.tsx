"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

type Resource = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  capacity: number;
  isActive?: boolean;
  is_active?: boolean;
};

function toLocalDateTimeValue(date: Date): string {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  );

  return localDate.toISOString().slice(0, 16);
}

function CreateReservationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loadingResources, setLoadingResources] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resourceError, setResourceError] = useState("");

  useEffect(() => {
    async function loadResources() {
      try {
        const response = await fetch("/api/resources", {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load resources.");
        }

        const availableResources: Resource[] = (
          data.resources ?? []
        ).filter(
          (resource: Resource) =>
            resource.isActive !== false && resource.is_active !== false
        );

        setResources(availableResources);

        if (availableResources.length > 0) {
          setResourceId(availableResources[0].id);
        }
      } catch (err) {
        setResourceError(
          err instanceof Error
            ? err.message
            : "Unable to load resources. Please try again."
        );
      } finally {
        setLoadingResources(false);
      }
    }

    loadResources();
  }, [router]);

  useEffect(() => {
    const startParam = searchParams.get("startTime");
    const endParam = searchParams.get("endTime");

    if (startParam) {
      const start = new Date(startParam);
      if (!Number.isNaN(start.getTime())) {
        setStartTime(toLocalDateTimeValue(start));
      }
    }

    if (endParam) {
      const end = new Date(endParam);
      if (!Number.isNaN(end.getTime())) {
        setEndTime(toLocalDateTimeValue(end));
      }
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!resourceId) {
      setError("Please select a resource.");
      return;
    }

    if (
      !startTime ||
      !endTime ||
      new Date(endTime).getTime() <= new Date(startTime).getTime()
    ) {
      setError("The end time must be later than the start time.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceId,
          title: title.trim(),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        if (response.status === 409) {
          setError(
            data.error ??
              "This resource is already reserved during that time. Please choose another time."
          );
        } else {
          setError(
            data.error ?? "Unable to create the reservation. Please try again."
          );
        }
        return;
      }

      router.push("/reservations");
      router.refresh();
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/reservations"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <span aria-hidden="true">←</span>
        Back to reservations
      </Link>

      <div className="mb-8 mt-6">
        <p className="text-sm font-medium text-blue-600">
          Resource management
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Create reservation
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Reserve a lab resource for your preferred date and time.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
          <h2 className="font-semibold text-slate-900">
            Reservation details
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Complete the details below to submit your booking.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
          <div>
            <label
              htmlFor="title"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Reservation title
            </label>
            <input
              id="title"
              type="text"
              required
              minLength={1}
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. General Meeting"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <div>
            <label
              htmlFor="resource"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Resource
            </label>
            <select
              id="resource"
              required
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
              disabled={loadingResources || resources.length === 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              <option value="">
                {loadingResources
                  ? "Loading resources..."
                  : resources.length === 0
                    ? "No active resources available"
                    : "Select a resource"}
              </option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} · {resource.type}
                  {resource.capacity > 1
                    ? ` · Capacity ${resource.capacity}`
                    : ""}
                </option>
              ))}
            </select>

            {resourceError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {resourceError}
              </p>
            )}

            {!loadingResources &&
              !resourceError &&
              resources.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  There are no active resources to book. Please contact an
                  administrator.
                </p>
              )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startTime"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Start date and time
              </label>
              <input
                id="startTime"
                type="datetime-local"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>

            <div>
              <label
                htmlFor="endTime"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                End date and time
              </label>
              <input
                id="endTime"
                type="datetime-local"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                min={startTime || undefined}
                className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
            <Link
              href="/reservations"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={
                submitting ||
                loadingResources ||
                resources.length === 0
              }
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating reservation..." : "Create reservation"}
            </button>
          </div>
        </form>
      </div>

      <p className="mt-4 text-center text-xs leading-5 text-slate-400">
        Reservations are subject to resource availability. Conflicting
        bookings will be rejected.
      </p>
    </div>
  );
}

export default function CreateReservationPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          Loading reservation form...
        </div>
      }
    >
      <CreateReservationForm />
    </Suspense>
  );
}