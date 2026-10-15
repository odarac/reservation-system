"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Reservation = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled";
  resourceName?: string;
};

type StatusFilter = "all" | "confirmed" | "cancelled";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadReservations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/reservations?mine=true", {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load reservations.");
      }

      const data = await response.json();
      setReservations(data.reservations ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const filteredReservations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reservations
      .filter((reservation) => {
        const matchesSearch =
          reservation.title.toLowerCase().includes(query) ||
          (reservation.resourceName ?? "").toLowerCase().includes(query);

        const matchesStatus =
          statusFilter === "all" || reservation.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort(
        (a, b) =>
          new Date(b.startTime).getTime() -
          new Date(a.startTime).getTime()
      );
  }, [reservations, search, statusFilter]);

  const confirmedCount = reservations.filter(
    (reservation) => reservation.status === "confirmed"
  ).length;

  const cancelledCount = reservations.filter(
    (reservation) => reservation.status === "cancelled"
  ).length;

  async function handleCancel(reservationId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this reservation?",
    );

    if (!confirmed) return;

    setCancellingId(reservationId);

    try {
      const response = await fetch(
        `/api/reservations/${encodeURIComponent(reservationId)}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel reservation.");
      }

      setReservations((previous) =>
        previous.map((reservation) =>
          reservation.id === reservationId
            ? { ...reservation, status: "cancelled" }
            : reservation,
        ),
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to cancel reservation.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  function ReservationActions({
    reservation,
    compact = false,
  }: {
    reservation: Reservation;
    compact?: boolean;
  }) {
    if (reservation.status !== "confirmed") {
      return (
        <span className="text-xs text-slate-400">No actions available</span>
      );
    }

    return (
      <div
        className={`flex flex-wrap items-center gap-2 ${
          compact ? "w-full" : "min-w-[150px]"
        }`}
      >
        <Link
          href={`/reservations/${encodeURIComponent(reservation.id)}/edit`}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={() => void handleCancel(reservation.id)}
          disabled={cancellingId === reservation.id}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancellingId === reservation.id ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600">
            Schedule management
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Reservations
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            View and manage your resource reservations.
          </p>
        </div>

        <Link
          href="/reservations/new"
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <span className="mr-2 text-lg leading-none">+</span>
          New reservation
        </Link>
      </header>

      {actionError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError("")}
            className="font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total reservations"
          value={reservations.length}
          description="All your reservations"
        />
        <StatCard
          label="Confirmed"
          value={confirmedCount}
          description="Active bookings"
        />
        <StatCard
          label="Cancelled"
          value={cancelledCount}
          description="Cancelled bookings"
        />
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">All reservations</h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredReservations.length}{" "}
              {filteredReservations.length === 1
                ? "reservation"
                : "reservations"}{" "}
              shown
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reservations..."
              className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:w-56"
              aria-label="Search reservations"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading reservations...
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void loadReservations()}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Try again
            </button>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500">
              ▦
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">
              {reservations.length === 0
                ? "No reservations yet"
                : "No matching reservations"}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              {reservations.length === 0
                ? "Create a reservation to get started."
                : "Try changing your search or status filter."}
            </p>
            {reservations.length === 0 && (
              <Link
                href="/reservations/new"
                className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Create reservation
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Wide layouts: table remains horizontally scrollable if needed. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] table-auto text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium lg:px-6">
                      Reservation
                    </th>
                    <th className="px-4 py-3 font-medium lg:px-6">Resource</th>
                    <th className="px-4 py-3 font-medium lg:px-6">
                      Date and time
                    </th>
                    <th className="px-4 py-3 font-medium lg:px-6">Status</th>
                    <th className="px-4 py-3 font-medium lg:px-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReservations.map((reservation) => (
                    <tr
                      key={reservation.id}
                      className="align-top transition hover:bg-slate-50/70"
                    >
                      <td className="max-w-[240px] break-words px-4 py-4 lg:px-6">
                        <p className="font-medium text-slate-900">
                          {reservation.title}
                        </p>
                        <p className="mt-1 break-all text-xs text-slate-400">
                          ID: {reservation.id}
                        </p>
                      </td>
                      <td className="max-w-[180px] whitespace-normal break-words px-4 py-4 text-slate-600 lg:px-6">
                        {reservation.resourceName || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 lg:px-6">
                        <p className="text-slate-800">
                          {formatDate(reservation.startTime)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatTime(reservation.startTime)} –{" "}
                          {formatTime(reservation.endTime)}
                        </p>
                      </td>
                      <td className="px-4 py-4 lg:px-6">
                        <StatusBadge status={reservation.status} />
                      </td>
                      <td className="px-4 py-4 lg:px-6">
                        <ReservationActions reservation={reservation} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Narrow layouts: actions are shown on every confirmed reservation card. */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filteredReservations.map((reservation) => (
                <article key={reservation.id} className="min-w-0 space-y-4 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-medium text-slate-900">
                        {reservation.title}
                      </h3>
                      <p className="mt-1 whitespace-normal break-words text-sm text-slate-500">
                        {reservation.resourceName || "No resource name"}
                      </p>
                    </div>
                    <StatusBadge status={reservation.status} />
                  </div>

                  <div className="text-sm text-slate-600">
                    <p>{formatDate(reservation.startTime)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(reservation.startTime)} –{" "}
                      {formatTime(reservation.endTime)}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Actions
                    </p>
                    <ReservationActions reservation={reservation} compact />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-400">{description}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Reservation["status"] }) {
  const styles =
    status === "confirmed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : "bg-slate-100 text-slate-600 ring-slate-500/20";

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${styles}`}
    >
      {status}
    </span>
  );
}
