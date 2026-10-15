"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
};

const navigation = [
  { label: "Overview", href: "/dashboard", icon: "◫" },
  { label: "Reservations", href: "/reservations", icon: "▤" },
  { label: "Resources", href: "/resources", icon: "▦" },
  { label: "My Profile", href: "/profile", icon: "◎" },
];

export default function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to verify your session.");
        }

        const data = await response.json();

        if (!cancelled) {
          setUser(data.user);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (response.ok) {
        router.replace("/login");
        router.refresh();
      }
    } catch {
      // Keep the user on the page if the request fails.
    }
  }

  const links =
    user?.role === "admin"
      ? [...navigation, { label: "User management", href: "/users", icon: "♙" }]
      : navigation;

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="text-sm text-slate-500">Loading your workspace…</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {menuOpen && (
        <button
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            S
          </div>
          <div>
            <p className="font-semibold tracking-tight">Schedulio</p>
            <p className="text-xs text-slate-500">Resource Reservation</p>
          </div>
        </div>

        <div className="px-4 pt-7">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          <nav className="space-y-1">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/dashboard" &&
                  pathname.startsWith(`${link.href}/`));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="w-5 text-center text-base" aria-hidden="true">
                    {link.icon}
                  </span>
                  {link.label}
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs capitalize text-slate-500">
                {user.role}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-h-screen md:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation menu"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 md:hidden"
            >
              ☰
            </button>
            <div>
              <p className="text-sm font-medium text-slate-500">
                Schedulio
              </p>
              <p className="font-semibold">
                {links.find((link) => link.href === pathname)?.label ??
                  "Workspace"}
              </p>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl p-5 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}