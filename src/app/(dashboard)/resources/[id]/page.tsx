"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Resource = { id: string; name: string; description: string | null; type: string; capacity: number; isActive?: boolean; is_active?: boolean };
type Occupied = { startTime: string; endTime: string };

function startOfWeek(date: Date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}
function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [resource, setResource] = useState<Resource | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [occupied, setOccupied] = useState<Occupied[]>([]);
  const [loadingResource, setLoadingResource] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [error, setError] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    async function loadResource() {
      try {
        setLoadingResource(true);
        const response = await fetch(`/api/resources/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (response.status === 401) { router.replace("/login"); return; }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Unable to load resource.");
        if (!data.resource) throw new Error("Resource not found.");
        if (!cancelled) setResource(data.resource);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load resource.");
      } finally {
        if (!cancelled) setLoadingResource(false);
      }
    }
    void loadResource();
    return () => { cancelled = true; };
  }, [id, router]);

  useEffect(() => {
    let cancelled = false;
    async function loadAvailability() {
      try {
        setLoadingCalendar(true);
        setCalendarError("");
        const params = new URLSearchParams({ from: weekStart.toISOString(), to: weekEnd.toISOString() });
        const response = await fetch(`/api/resources/${encodeURIComponent(id)}/availability?${params}`, { cache: "no-store" });
        if (response.status === 401) { router.replace("/login"); return; }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Unable to load availability.");
        if (!cancelled) setOccupied(data.occupied ?? []);
      } catch (err) {
        if (!cancelled) setCalendarError(err instanceof Error ? err.message : "Unable to load availability.");
      } finally {
        if (!cancelled) setLoadingCalendar(false);
      }
    }
    void loadAvailability();
    return () => { cancelled = true; };
  }, [id, weekStart, weekEnd, router]);

  if (loadingResource) return <p className="text-sm text-slate-500">Loading resource...</p>;
  if (error || !resource) return <p role="alert" className="text-sm text-red-600">{error || "Resource not found."}</p>;

  const active = resource.isActive ?? resource.is_active ?? true;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/resources" className="text-sm font-medium text-blue-600 hover:underline">← Back to resources</Link>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">{resource.name}</h1>
          <p className="mt-2 text-sm text-slate-600">{resource.description || "No description provided."}</p>
          <p className="mt-2 text-sm text-slate-500">{resource.type} · Capacity: {resource.capacity} · {active ? "Active" : "Inactive"}</p>
        </div>
        {active && <Link href={`/reservations/new?resourceId=${encodeURIComponent(id)}`} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Make a reservation</Link>}
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Availability calendar</h2>
            <p className="mt-1 text-sm text-slate-500">Booked times are shown without reservation or user details.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekStart((d) => addDays(d, -7))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" aria-label="Previous week">←</button>
            <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Today</button>
            <button type="button" onClick={() => setWeekStart((d) => addDays(d, 7))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" aria-label="Next week">→</button>
          </div>
        </div>
        <p className="mb-4 text-sm font-medium text-slate-700">{weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – {addDays(weekEnd, -1).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</p>
        {calendarError ? <p role="alert" className="text-sm text-red-600">{calendarError}</p> : loadingCalendar ? <p className="text-sm text-slate-500">Loading booked times...</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day) => {
              const nextDay = addDays(day, 1);
              const bookings = occupied
                .filter((slot) => new Date(slot.startTime) < nextDay && new Date(slot.endTime) > day)
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
              return (
                <div key={day.toISOString()} className="min-h-36 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">{day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</h3>
                  {bookings.length === 0 ? <p className="text-xs text-slate-500">No bookings</p> : (
                    <ul className="space-y-2">
                      {bookings.map((slot, index) => {
                        const start = new Date(Math.max(new Date(slot.startTime).getTime(), day.getTime()));
                        const end = new Date(Math.min(new Date(slot.endTime).getTime(), nextDay.getTime()));
                        return <li key={`${slot.startTime}-${slot.endTime}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-900">Booked<br />{formatTime(start)} – {end.getTime() === nextDay.getTime() ? "midnight" : formatTime(end)}</li>;
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}