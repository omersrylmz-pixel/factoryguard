import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { ROLE_LABEL } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import type { Page, RiskFinding, Site } from "../types/api";

interface NavItem {
  to: string;
  label: string;
  icon: "overview" | "map" | "assets" | "risks" | "sensors" | "reports" | "settings";
  badge?: "risks";
}

const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "MONITOR",
    items: [
      { to: "/", label: "Overview · Genel Bakış", icon: "overview" },
      { to: "/network", label: "Assets Map · Ağ Haritası", icon: "map" },
      { to: "/sensors", label: "Sensors & Multimeter", icon: "sensors" },
    ],
  },
  {
    group: "INVENTORY",
    items: [{ to: "/assets", label: "Assets · Cihaz Envanteri", icon: "assets" }],
  },
  {
    group: "DETECT",
    items: [
      { to: "/risks", label: "Alerts · Risk Merkezi", icon: "risks", badge: "risks" },
      { to: "/reports", label: "Reports & SIEM CEF", icon: "reports" },
    ],
  },
  {
    group: "CONFIGURE",
    items: [{ to: "/settings", label: "Settings · Fabrika & Bölge", icon: "settings" }],
  },
];

function NavIcon({ name }: { name: NavItem["icon"] }) {
  switch (name) {
    case "overview":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "map":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="12" cy="18" r="3" />
          <path d="M8.5 7.5L10.5 15.5M15.5 7.5L13.5 15.5M9 6h6" />
        </svg>
      );
    case "assets":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="6" rx="1" />
          <rect x="2" y="14" width="20" height="6" rx="1" />
          <circle cx="6" cy="7" r="1" fill="currentColor" />
          <circle cx="6" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    case "risks":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "sensors":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "reports":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "settings":
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
  }
}

export default function AppLayout() {
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();
  const navigate = useNavigate();
  const [globalSearch, setGlobalSearch] = useState("");

  const sitesQuery = useQuery({
    queryKey: ["sites", activeOrg?.id],
    queryFn: () => api<Site[]>("/sites"),
    enabled: !!activeOrg,
  });

  const openRisksQuery = useQuery({
    queryKey: ["risks", activeOrg?.id, "open"],
    queryFn: () => api<Page<RiskFinding>>("/risks?status=open&limit=200"),
    enabled: !!activeOrg,
  });

  const openRiskCount = openRisksQuery.data?.total ?? 0;
  const primarySite = sitesQuery.data?.[0];

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = globalSearch.trim();
    navigate(q ? `/assets?q=${encodeURIComponent(q)}` : "/assets");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F7FA] text-slate-900">
      {/* Üst İnce Telemetri Şeridi (Nozomi Vantage Tarzı) */}
      <div className="flex items-center justify-between bg-[#071A2F] px-5 py-1 text-[11px] text-slate-300">
        <div className="flex items-center gap-4">
          <span className="font-semibold tracking-wider text-cyan-400">FACTORYGUARD LITE · OT SECURITY CONSOLE</span>
          <span className="hidden text-slate-400 sm:inline">
            LICENSEE: <strong className="text-white">{activeOrg?.name ?? "—"}</strong>
          </span>
          <span className="hidden text-slate-400 md:inline">
            MODE: <strong className="text-emerald-400">PASSIVE SPAN / ZEEK & DPI</strong>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE VIEW
          </span>
          <span className="font-mono text-[10px] text-slate-400">v0.5.0-OT</span>
        </div>
      </div>

      {/* Üst Küresel Başlık Çubuğu (MON5 Tarzı) */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5 shadow-2xs">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EA580C] font-mono text-xs font-extrabold tracking-tight text-white shadow-xs">
              FG
            </span>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-slate-900">FactoryGuard</div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Industrial OT</div>
            </div>
          </Link>

          {/* Site / Organizasyon Seçici */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 font-mono text-[10px] font-bold text-[#EA580C]">
              CP
            </span>
            <div className="text-xs">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">SITE · PLANT</div>
              {organizations.length > 1 ? (
                <select
                  aria-label="Organizasyon"
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  value={activeOrg?.id ?? ""}
                  onChange={(e) => setActiveOrg(e.target.value)}
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="font-semibold text-slate-800">
                  {primarySite?.name ?? activeOrg?.name ?? "Ana Üretim Tesisi"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Merkez Arama Çubuğu (MON5 ⌘K) */}
        <form onSubmit={handleSearchSubmit} className="hidden flex-1 max-w-md md:block">
          <div className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Cihaz, IP, MAC, üretici, CVE veya protokol ara..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-12 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#EA580C] focus:bg-white focus:outline-none"
            />
            <span className="pointer-events-none absolute right-2.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              ⌘K
            </span>
          </div>
        </form>

        {/* Sağ Durum ve Kullanıcı Kontrolleri */}
        <div className="flex items-center gap-2.5 text-xs">
          <Link
            to="/risks"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 font-semibold text-[#EA580C] hover:bg-orange-100"
          >
            <span className="h-2 w-2 rounded-full bg-[#EA580C]" />
            <span>{openRiskCount} Açık Alarm</span>
          </Link>
          {activeOrg && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700">
              {ROLE_LABEL[activeOrg.role]}
            </span>
          )}
          <button
            onClick={() => void logout()}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Çıkış
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sol Koyu Lacivert Kenar Çubuğu (MON5 #0B1528) */}
        <aside className="flex w-60 shrink-0 flex-col bg-[#0B1528] text-slate-300">
          {/* Zaman Penceresi Seçici Kart */}
          <div className="p-3">
            <div className="rounded-lg border border-slate-800 bg-[#111E36] px-3 py-2">
              <div className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Pasif İzleme Aktif</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                {sitesQuery.data?.length ?? 1} Fabrika · Gerçek Zamanlı
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-1">
            {NAV_GROUPS.map((grp) => (
              <div key={grp.group}>
                <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {grp.group}
                </div>
                <div className="space-y-1">
                  {grp.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        `group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                          isActive
                            ? "border border-slate-700/80 bg-[#162440] text-white shadow-xs"
                            : "text-slate-400 hover:bg-[#132038] hover:text-slate-100"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r bg-[#EA580C]" />
                          )}
                          <span className="flex items-center gap-2.5">
                            <NavIcon name={item.icon} />
                            <span>{item.label}</span>
                          </span>
                          {item.badge === "risks" && openRiskCount > 0 && (
                            <span className="rounded-full bg-[#EA580C] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                              {openRiskCount}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Alt Kullanıcı Profil Kartı (MON5 Tarzı) */}
          <div className="border-t border-slate-800/80 p-3">
            <div className="flex items-center gap-2.5 rounded-lg bg-[#111E36] px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EA580C]/20 font-mono text-xs font-bold text-[#EA580C]">
                {(user?.full_name ?? "FG").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white">{user?.full_name ?? "OT Admin"}</div>
                <div className="truncate text-[10px] text-slate-400">
                  {activeOrg ? `${ROLE_LABEL[activeOrg.role]} · Security Analyst` : "Security Analyst"}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Ana İçerik Alanı */}
        <main className="min-w-0 flex-1 p-6">
          {activeOrg ? (
            <Outlet />
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Herhangi bir organizasyona üye değilsiniz. Yöneticinizden davet isteyin.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
