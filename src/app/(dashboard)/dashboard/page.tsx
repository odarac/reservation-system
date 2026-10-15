"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Reservation = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled";
  resourceName?: string;
};

const DAY_START = 6 * 60; // 06:00
const DAY_END = 22 * 60;  // 22:00
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 32;

const GRID_HEIGHT =
  ((DAY_END - DAY_START) / SLOT_MINUTES) * SLOT_HEIGHT;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-AU", options).format(date);
}

function getReservationUrl(date: Date, minutes: number) {
  const start = new Date(date);
  start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return `/reservations/new?startTime=${encodeURIComponent(
    start.toISOString()
  )}&endTime=${encodeURIComponent(end.toISOString())}`;
}

type PositionedReservation = {
  reservation: Reservation;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
};

function layoutDayReservations(
  reservations: Reservation[],
  date: Date
): PositionedReservation[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = addDays(dayStart, 1);

  const events = reservations
    .filter((reservation) => {
      if (reservation.status !== "confirmed") return false;

      const start = new Date(reservation.startTime);
      const end = new Date(reservation.endTime);

      return start < dayEnd && end > dayStart;
    })
    .map((reservation) => {
      const start = new Date(reservation.startTime);
      const end = new Date(reservation.endTime);

      const visibleStart = new Date(
        Math.max(start.getTime(), dayStart.getTime())
      );
      const visibleEnd = new Date(
        Math.min(end.getTime(), dayEnd.getTime())
      );

      const startMinutes =
        visibleStart.getHours() * 60 + visibleStart.getMinutes();
      const endMinutes =
        visibleEnd.getHours() * 60 + visibleEnd.getMinutes();

      return {
        reservation,
        startMinutes,
        endMinutes,
        lane: 0,
        laneCount: 1,
      };
    })
    .filter(
      (event) =>
        event.endMinutes > DAY_START &&
        event.startMinutes < DAY_END
    )
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        b.endMinutes - a.endMinutes
    );

  // Allocate separate lanes to overlapping reservations.
  let group: typeof events = [];
  let groupEnd = -1;

  const finishGroup = () => {
    if (!group.length) return;

    const laneEnds: number[] = [];

    for (const event of group) {
      let lane = laneEnds.findIndex(
        (end) => end <= event.startMinutes
      );

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(event.endMinutes);
      } else {
        laneEnds[lane] = event.endMinutes;
      }

      event.lane = lane;
    }

    for (const event of group) {
      event.laneCount = Math.max(laneEnds.length, 1);
    }

    group = [];
    groupEnd = -1;
  };

  for (const event of events) {
    if (group.length && event.startMinutes >= groupEnd) {
      finishGroup();
    }

    group.push(event);
    groupEnd = Math.max(groupEnd, event.endMinutes);
  }

  finishGroup();

  return events.map((event) => {
    const visibleStart = Math.max(event.startMinutes, DAY_START);
    const visibleEnd = Math.min(event.endMinutes, DAY_END);

    return {
      reservation: event.reservation,
      top:
        ((visibleStart - DAY_START) / (DAY_END - DAY_START)) *
        GRID_HEIGHT,
      height: Math.max(
        ((visibleEnd - visibleStart) / (DAY_END - DAY_START)) *
          GRID_HEIGHT,
        22
      ),
      lane: event.lane,
      laneCount: event.laneCount,
    };
  });
}

export default function DashboardPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setNow(new Date());

    // Refresh the current-time indicator once per minute.
    const timer = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReservations() {
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
          throw new Error("Could not load your reservations.");
        }

        const data = await response.json();

        if (!cancelled) {
          setReservations(data.reservations ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "An unexpected error occurred."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReservations();

    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(week, i)),
    [week]
  );

  const upcoming = useMemo(() => {
    const timestamp = now?.getTime() ?? Date.now();

    return reservations
      .filter(
        (reservation) =>
          reservation.status === "confirmed" &&
          new Date(reservation.endTime).getTime() > timestamp
      )
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() -
          new Date(b.startTime).getTime()
      );
  }, [reservations, now]);

  const currentWeekEnd = addDays(week, 7);
  const isCurrentWeek =
    dayKey(startOfWeek(new Date())) === dayKey(week);

  const currentMinutes = now
    ? now.getHours() * 60 + now.getMinutes()
    : -1;

  const showCurrentTime =
    now &&
    isCurrentWeek &&
    currentMinutes >= DAY_START &&
    currentMinutes < DAY_END;

  function goToToday() {
    setWeek(startOfWeek(new Date()));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Weekly schedule
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your reservations, organised by day and time.
          </p>
        </div>

        <Link
          href="/reservations/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <span aria-hidden="true">＋</span>
          New reservation
        </Link>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
          <button
            onClick={() => window.location.reload()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Weekly calendar */}
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-semibold text-slate-900">
                {formatDate(week, {
                  day: "numeric",
                  month: "short",
                })}{" "}
                –{" "}
                {formatDate(addDays(week, 6), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                06:00–22:00
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goToToday}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                onClick={() => setWeek(addDays(week, -7))}
                aria-label="Previous week"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-700 hover:bg-slate-50"
              >
                ‹
              </button>
              <button
                onClick={() => setWeek(addDays(week, 7))}
                aria-label="Next week"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-700 hover:bg-slate-50"
              >
                ›
              </button>
            </div>
          </div>

          {loading && (
            <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700">
              Loading reservations…
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* Day headings */}
              <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
                <div className="border-r border-slate-100" />

                {days.map((day, index) => {
                  const isToday =
                    dayKey(day) === dayKey(new Date());

                  return (
                    <div
                      key={dayKey(day)}
                      className="border-r border-slate-100 px-1 py-3 text-center last:border-r-0"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {WEEKDAYS[index]}
                      </p>
                      <span
                        className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                          isToday
                            ? "bg-blue-600 text-white"
                            : "text-slate-800"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Time grid */}
              <div className="max-h-[650px] overflow-y-auto overscroll-contain">
                <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
                  <div className="relative">
                    {Array.from(
                      {
                        length:
                          (DAY_END - DAY_START) / 60 + 1,
                      },
                      (_, index) => {
                        const minutes = DAY_START + index * 60;

                        return (
                          <div
                            key={minutes}
                            className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400"
                            style={{
                              top:
                                ((minutes - DAY_START) /
                                  (DAY_END - DAY_START)) *
                                GRID_HEIGHT,
                            }}
                          >
                            {String(Math.floor(minutes / 60)).padStart(
                              2,
                              "0"
                            )}
                            :00
                          </div>
                        );
                      }
                    )}
                  </div>

                  {days.map((day) => {
                    const dayReservations = layoutDayReservations(
                      reservations,
                      day
                    );

                    return (
                      <div
                        key={dayKey(day)}
                        className="relative border-l border-slate-100"
                        style={{ height: GRID_HEIGHT }}
                      >
                        {/* Clickable half-hour slots */}
                        {Array.from(
                          {
                            length:
                              (DAY_END - DAY_START) / SLOT_MINUTES,
                          },
                          (_, index) => {
                            const minutes =
                              DAY_START + index * SLOT_MINUTES;

                            return (
                              <Link
                                key={minutes}
                                href={getReservationUrl(day, minutes)}
                                aria-label={`Create reservation on ${formatDate(
                                  day,
                                  {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "long",
                                  }
                                )} at ${String(
                                  Math.floor(minutes / 60)
                                ).padStart(2, "0")}:${String(
                                  minutes % 60
                                ).padStart(2, "0")}`}
                                title="Create reservation"
                                className="absolute inset-x-0 z-0 border-b border-slate-100/80 transition hover:bg-blue-50/70"
                                style={{
                                  top: index * SLOT_HEIGHT,
                                  height: SLOT_HEIGHT,
                                }}
                              />
                            );
                          }
                        )}

                        {/* Hour lines */}
                        {Array.from(
                          {
                            length:
                              (DAY_END - DAY_START) / 60 + 1,
                          },
                          (_, index) => (
                            <div
                              key={index}
                              className="pointer-events-none absolute inset-x-0 z-[1] border-t border-slate-200"
                              style={{ top: index * SLOT_HEIGHT * 2 }}
                            />
                          )
                        )}

                        {/* Reservation blocks */}
                        {dayReservations.map((event) => {
                          const reservation = event.reservation;

                          const left =
                            (event.lane / event.laneCount) * 100;
                          const width = 100 / event.laneCount;

                          return (
                            <div
                              key={reservation.id}
                              title={`${reservation.title} · ${formatTime(
                                new Date(reservation.startTime)
                              )}–${formatTime(
                                new Date(reservation.endTime)
                              )}`}
                              className="absolute z-10 overflow-hidden rounded-md border border-blue-200 bg-blue-100 px-1 py-1 text-blue-900 shadow-sm sm:px-1.5"
                              style={{
                                top: event.top,
                                height: event.height,
                                left: `calc(${left}% + 1px)`,
                                width: `calc(${width}% - 2px)`,
                              }}
                            >
                              <p className="truncate text-[10px] font-semibold leading-tight sm:text-xs">
                                {reservation.title}
                              </p>
                              {event.height >= 42 && (
                                <p className="mt-1 whitespace-normal break-words text-[9px] leading-tight text-blue-800 sm:text-[10px]">
                                  {reservation.resourceName}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* Current-time indicator */}
                        {showCurrentTime &&
                          dayKey(day) === dayKey(now) && (
                            <div
                              className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500"
                              style={{
                                top:
                                  ((currentMinutes - DAY_START) /
                                    (DAY_END - DAY_START)) *
                                  GRID_HEIGHT,
                              }}
                            >
                              <span className="absolute -left-1.5 -top-[5px] h-2.5 w-2.5 rounded-full bg-rose-500" />
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-blue-200 bg-blue-100" />
              Confirmed reservation
            </span>
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-4 bg-rose-500" />
              Current time
            </span>
            <span>Click an empty slot to book</span>
          </div>
        </section>

        {/* Upcoming reservations sidebar */}
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">
                Upcoming reservations
              </h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {upcoming.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Your next bookings
            </p>
          </div>

          <div className="max-h-[650px] divide-y divide-slate-100 overflow-y-auto">
            {loading ? (
              <div className="space-y-4 p-5">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="animate-pulse space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-100" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-700">
                  ◷
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  No upcoming bookings
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Your confirmed reservations will appear here.
                </p>
                <Link
                  href="/reservations/new"
                  className="mt-4 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Make a reservation
                </Link>
              </div>
            ) : (
              upcoming.slice(0, 12).map((reservation) => {
                const start = new Date(reservation.startTime);
                const end = new Date(reservation.endTime);

                return (
                  <div
                    key={reservation.id}
                    className="flex gap-3 p-4 transition hover:bg-slate-50"
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center justify-center self-start rounded-xl bg-blue-50 py-2 text-blue-700">
                      <span className="text-[10px] font-semibold uppercase">
                        {formatDate(start, { month: "short" })}
                      </span>
                      <span className="text-xl font-semibold leading-6">
                        {start.getDate()}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {reservation.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {reservation.resourceName}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        {formatTime(start)}–{formatTime(end)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDate(start, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 p-4">
            <Link
              href="/reservations"
              className="block rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View all reservations
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}