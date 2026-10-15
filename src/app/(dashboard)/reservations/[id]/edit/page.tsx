"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Reservation = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled";
  resourceId?: string;
  resourceName?: string;
};

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function EditReservationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reservationId = params.id;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReservation() {
      try {
        setLoading(true);
        setError("");

        // Assumes GET /api/reservations/[id] returns { reservation: {...} }.
        const response = await fetch(
          `/api/reservations/${encodeURIComponent(reservationId)}`,
          { cache: "no-store" }
        );

        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }

        if (response.status === 404) {
          throw new Error("Reservation not found, or you do not have access to it.");
        }

        if (!response.ok) {
          throw new Error("Unable to load this reservation.");
        }

        const data = await response.json();
        const item: Reservation | undefined = data.reservation;

        if (!item) {
          throw new Error("The API response did not include a reservation.");
        }

        if (!active) return;

        setReservation(item);
        setTitle(item.title);
        setStartTime(toLocalInput(item.startTime));
        setEndTime(toLocalInput(item.endTime));

        if (item.status !== "confirmed") {
          setError("Only confirmed reservations can be edited.");
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (reservationId) void loadReservation();

    return () => {
      active = false;
    };
  }, [reservationId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation) return;

    if (!title.trim()) {
      setError("Enter a reservation title.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      !startTime ||
      !endTime ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      setError("Choose a valid start and end time. The end must be after the start.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/reservations/${encodeURIComponent(reservationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update the reservation.");
      }

      setSuccess("Reservation updated successfully.");
      // Return to the reservations list after a brief confirmation.
      router.push("/reservations");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = reservation?.status === "confirmed";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <Link
          href="/reservations"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to reservations
        </Link>
        <p className="mt-4 text-sm font-medium text-blue-600">
          Schedule management
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Edit reservation
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Update the title and scheduled time for your reservation.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Loading reservation...
          </div>
        ) : error && !reservation ? (
          <div>
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
            <Link
              href="/reservations"
              className="mt-5 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Return to reservations
            </Link>
          </div>
        ) : reservation ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Resource
              </p>
              <p className="mt-1 break-words font-medium text-slate-900">
                {reservation.resourceName || "Reserved resource"}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Reservation ID: <span className="break-all">{reservation.id}</span>
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
              >
                {success}
              </div>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Reservation title
              </span>
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!canEdit || saving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="e.g. Team meeting"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Start date and time
                </span>
                <input
                  required
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={!canEdit || saving}
                  className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  End date and time
                </span>
                <input
                  required
                  type="datetime-local"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  disabled={!canEdit || saving}
                  className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <Link
                href="/reservations"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={!canEdit || saving}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving changes…" : "Save changes"}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
